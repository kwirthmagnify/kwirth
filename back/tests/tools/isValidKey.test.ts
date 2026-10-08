import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthorizationManagement } from '../../src/tools/AuthorizationManagement'
import { accessKeyBuild, accessKeySerialize } from '@kwirthmagnify/kwirth-common'

/*
    A3 of plans/auth-hardening: isValidKey is the silent twin of validKey (no response, no logging), used by
    /config/info to decide whether to reveal the cluster topology. It must never throw and never answer.
*/

const MK = 'secret-master'

// Enough of ApiKeyApi for isValidKey: masterKey, the stored list, isDesktop, and a no-op refresh.
const fakeApiKeyApi = (apiKeys: any[] = []) => ({ masterKey: MK, apiKeys, isDesktop: true, refreshKeys: async () => {} }) as any
const reqWith = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as any

test('a valid bearer key is accepted', async () => {
    const expire = Date.now() + 86400000
    const id = AuthorizationManagement.signBearer(MK, 'cluster::::', expire)
    const key = accessKeySerialize(accessKeyBuild(id, 'bearer:' + expire, 'cluster::::'))
    assert.equal(await AuthorizationManagement.isValidKey(reqWith('Bearer ' + key), fakeApiKeyApi()), true)
})

test('no authorization header → false, no throw', async () => {
    assert.equal(await AuthorizationManagement.isValidKey(reqWith(), fakeApiKeyApi()), false)
})

test('a forged bearer (wrong signature) → false', async () => {
    const expire = Date.now() + 86400000
    const key = accessKeySerialize(accessKeyBuild('deadbeef', 'bearer:' + expire, 'cluster::::'))
    assert.equal(await AuthorizationManagement.isValidKey(reqWith('Bearer ' + key), fakeApiKeyApi()), false)
})

test('an expired stored key → false', async () => {
    const expired = accessKeyBuild('id1', 'permanent', 'view::::')
    const apiKey = { accessKey: expired, expire: Date.now() - 1000 }
    const key = accessKeySerialize(expired)
    assert.equal(await AuthorizationManagement.isValidKey(reqWith('Bearer ' + key), fakeApiKeyApi([apiKey])), false)
})

test('a valid stored key → true', async () => {
    const ak = accessKeyBuild('id2', 'permanent', 'view::::')
    const apiKey = { accessKey: ak, expire: Date.now() + 60_000 }
    const key = accessKeySerialize(ak)
    assert.equal(await AuthorizationManagement.isValidKey(reqWith('Bearer ' + key), fakeApiKeyApi([apiKey])), true)
})
