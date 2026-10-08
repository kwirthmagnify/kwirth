import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CoreV1Api } from '@kubernetes/client-node'
import { ServiceAccountToken } from '../../src/tools/ServiceAccountToken'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    The token Kwirth presents to the kubelet (plan: plans/least-privilege/PLAN.md, B1).

    What is pinned down here is the bug that was shipped for a long time: the token was asked for ONCE
    at boot, with a week of life, and never renewed, so seven days after every start the kubelet began
    answering 401 and metrics stopped in silence. The fix is to read the token Kubernetes already
    projects into the pod, which the kubelet rotates, and to RE-READ it instead of remembering it.

    The second thing pinned down is that ClusterInfo.token is a getter. Every consumer —the metrics
    provider, and plugins that never change— holds a ClusterInfo and writes 'Bearer ' + info.token, so
    freshness has to come from the property itself or it does not come at all.
*/

const tmpToken = (contents?: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-satoken-'))
    const file = path.join(dir, 'token')
    if (contents !== undefined) fs.writeFileSync(file, contents)
    return file
}

// The API is only reached on the fallback path, and only to ask for a token.
const fakeCoreApi = (token?: string, onCall?: () => void): CoreV1Api => ({
    createNamespacedServiceAccountToken: async () => {
        onCall?.()
        if (!token) throw new Error('Forbidden')
        return { status: { token } }
    }
} as unknown as CoreV1Api)

test('the projected token is preferred, and the API is never asked', async () => {
    let apiCalls = 0
    const file = tmpToken('projected-value')
    const sat = new ServiceAccountToken(fakeCoreApi('requested-value', () => apiCalls++), 'kwirth', file)

    assert.equal(await sat.obtain('kwirth-sa', 'kwirth'), 'projected-value')
    assert.equal(sat.current, 'projected-value')
    // the whole point of B1: no 'create' on serviceaccounts/token, so a role without it still works
    assert.equal(apiCalls, 0)
})

test('a rotated token is picked up, without anyone reassigning anything', async () => {
    const file = tmpToken('first')
    // cacheMs 0: the kubelet rotation is what is being tested, not the cache
    const sat = new ServiceAccountToken(fakeCoreApi(), 'kwirth', file, 0)
    await sat.obtain('kwirth-sa', 'kwirth')
    assert.equal(sat.current, 'first')

    fs.writeFileSync(file, 'second')
    assert.equal(sat.current, 'second', 'the token is remembered instead of re-read — this is the bug')
})

test('the cache window holds the value, and lets go of it when it passes', async () => {
    const file = tmpToken('first')
    const sat = new ServiceAccountToken(fakeCoreApi(), 'kwirth', file, 60_000)
    await sat.obtain('kwirth-sa', 'kwirth')

    fs.writeFileSync(file, 'second')
    assert.equal(sat.current, 'first', 'inside the window it must not hit the filesystem again')

    const expired = new ServiceAccountToken(fakeCoreApi(), 'kwirth', file, 0)
    assert.equal(expired.current, 'second')
})

test('with no projected file it falls back to a TokenRequest', async () => {
    let apiCalls = 0
    const missing = path.join(os.tmpdir(), 'kwirth-satoken-does-not-exist', 'token')
    const sat = new ServiceAccountToken(fakeCoreApi('requested-value', () => apiCalls++), 'kwirth', missing)

    assert.equal(await sat.obtain('kwirth-sa', 'kwirth'), 'requested-value')
    assert.equal(apiCalls, 1)
    // and it keeps answering with it, since there is no file to re-read
    assert.equal(sat.current, 'requested-value')
})

test('an empty file is not a token', async () => {
    let apiCalls = 0
    const file = tmpToken('   \n')
    const sat = new ServiceAccountToken(fakeCoreApi('requested-value', () => apiCalls++), 'kwirth', file)

    assert.equal(await sat.obtain('kwirth-sa', 'kwirth'), 'requested-value')
    assert.equal(apiCalls, 1)
})

test('without a projected file and without permission there is no token, and it does not throw', async () => {
    const missing = path.join(os.tmpdir(), 'kwirth-satoken-does-not-exist', 'token')
    const sat = new ServiceAccountToken(fakeCoreApi(), 'kwirth', missing)

    assert.equal(await sat.obtain('kwirth-sa', 'kwirth'), undefined)
    assert.equal(sat.current, undefined)
})

test('ClusterInfo.token reads through, so a rotation reaches every consumer', async () => {
    const file = tmpToken('first')
    const clusterInfo = new ClusterInfo()
    clusterInfo.saToken = new ServiceAccountToken(fakeCoreApi(), 'kwirth', file, 0)
    await clusterInfo.saToken.obtain('kwirth-sa', 'kwirth')

    assert.equal(clusterInfo.token, 'first')
    fs.writeFileSync(file, 'second')
    // nobody assigned anything: this is what keeps unchanged plugins on a current token
    assert.equal(clusterInfo.token, 'second')
})

test('ClusterInfo.token is undefined before there is a ServiceAccountToken, and does not blow up', () => {
    // outside Kubernetes the token is never obtained, and the metrics provider asks for it anyway
    assert.equal(new ClusterInfo().token, undefined)
})
