import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MetricsProvider } from '../../src/providers/metrics/MetricsProvider'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { KwirthData } from '@kwirthmagnify/kwirth-common'

/*
    The metrics clock when there is no ServiceAccount token (plan: plans/least-privilege/PLAN.md, B2).

    Inside a cluster the kubelet is reached with that token, and without one every scrape is a 401.
    The provider used to start its clock anyway: one error line per node every metricsInterval
    seconds, for ever, over a condition that cannot fix itself while the process lives. A deployment
    with no permission to mint a token is a legitimate setup — kwirth-full-ro.yaml is exactly that —
    not a fault to shout about fifteen times a minute.

    The desktop is the exception that has to keep working: there the kubelet is reached through the
    API server proxy with the kubeconfig credentials, and no token is involved.
*/

const kwirthData = (isDesktop: boolean): KwirthData => ({
    clusterName: 'test',
    namespace: 'kwirth',
    deployment: 'kwirth',
    inCluster: !isDesktop,
    isDesktop,
    version: '0.0.0',
    lastVersion: '0.0.0',
    metricsInterval: 15
} as unknown as KwirthData)

const providerWith = (isDesktop: boolean, token: string|undefined): MetricsProvider => {
    const clusterInfo = new ClusterInfo()
    clusterInfo.nodes = new Map()
    // ClusterInfo.token reads through saToken; leaving it unset is what "no token" looks like
    if (token !== undefined) clusterInfo.saToken = { current: token } as unknown as ClusterInfo['saToken']
    return new MetricsProvider(clusterInfo, kwirthData(isDesktop))
}

test('no token in a cluster: the clock is not started', async () => {
    const provider = providerWith(false, undefined)
    await provider.startProvider()
    assert.equal(provider.metricsIntervalRef, undefined, 'a 401 per node every 15s, for ever, is not a useful log')
})

test('with a token the clock does start', async () => {
    const provider = providerWith(false, 'a-token')
    await provider.startProvider()
    assert.notEqual(provider.metricsIntervalRef, undefined)
    provider.stopMetricsInterval()
})

test('on the desktop there is no token and the clock starts anyway', async () => {
    // the kubeconfig credentials are what reaches the kubelet there, so no token is expected
    const provider = providerWith(true, undefined)
    await provider.startProvider()
    assert.notEqual(provider.metricsIntervalRef, undefined)
    provider.stopMetricsInterval()
})
