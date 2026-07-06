// Fase 1 (instances/desktop): resolveChannelMode decides local vs remote placement of a channel back.
// Matrix: instances (multi/single/undefined) x environment (in-cluster / not-in-cluster).

import test from 'node:test'
import assert from 'node:assert/strict'
import { EChannelInstances, EChannelMode, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { resolveChannelMode } from '../../src/tools/ChannelPlacement'

const reqs = (instances?: EChannelInstances): IBackChannelRequirements => ({ storage: false, providers: [], instances })

test('multi is always LOCAL (in-cluster and not)', () => {
    assert.equal(resolveChannelMode(reqs(EChannelInstances.MULTI), true), EChannelMode.LOCAL)
    assert.equal(resolveChannelMode(reqs(EChannelInstances.MULTI), false), EChannelMode.LOCAL)
})

test('undefined instances defaults to LOCAL (backward compatible)', () => {
    assert.equal(resolveChannelMode(reqs(undefined), true), EChannelMode.LOCAL)
    assert.equal(resolveChannelMode(reqs(undefined), false), EChannelMode.LOCAL)
})

test('single is LOCAL in-cluster (its home)', () => {
    assert.equal(resolveChannelMode(reqs(EChannelInstances.SINGLE), true), EChannelMode.LOCAL)
})

test('single is REMOTE when not in-cluster (desktop/docker)', () => {
    assert.equal(resolveChannelMode(reqs(EChannelInstances.SINGLE), false), EChannelMode.REMOTE)
})
