import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProviderInstance, IProvider, TProviderConstructor } from '../../src/providers/IProvider'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { KwirthData } from '@kwirthmagnify/kwirth-common'

/*
    'started' on a provider means "its PUBLIC router is mounted" — it is the guard against mounting it
    twice — and a provider with no public router never gets it. Whoever wanted to know whether a provider
    RUNS read it anyway (the Status channel), and said "Not started" of events and metrics, which keep
    their routes behind the access key. 'providerStarted' is that other fact: false from the moment the
    core creates the instance, true once startProvider() returns (set where the core starts providers).
*/

class Bare {
    id = 'bare'
}

test('a provider instance is born with providerStarted false, and without the router flag', () => {
    const instance = createProviderInstance(Bare as unknown as TProviderConstructor, new ClusterInfo(), {} as KwirthData) as IProvider
    assert.equal(instance.providerStarted, false)
    assert.equal(instance.started, undefined, "'started' stays the router's, untouched")
})
