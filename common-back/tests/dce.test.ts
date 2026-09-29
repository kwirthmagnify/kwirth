// getDce(): what a consumer gets by id from the registry the core fills (plan: plans/dce/PRD.md, RF4).
// The rule pinned down here is that it NEVER returns undefined: a missing DCE and a failed one are both
// errors, each with its own message, because they are fixed in different ways.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDce, hasDce } from '../src/IDce'
import { DCE_REGISTRY, EDceState, TDceRegistry } from '@kwirthmagnify/kwirth-common'

const registry = (): TDceRegistry => {
    const g = globalThis as unknown as Record<string, TDceRegistry | undefined>
    return (g[DCE_REGISTRY] ??= {})
}

test('a loaded DCE comes back as the very object the core stored', () => {
    const instance = { next: () => 1 }
    registry()['one'] = { state: EDceState.LOADED, instance }
    assert.equal(getDce('one'), instance)
    assert.equal(hasDce('one'), true)
})

test('🔴 a DCE that is not in the registry throws, and says it is not installed or not loaded yet', () => {
    delete registry()['nobody']
    assert.throws(() => getDce('nobody'), /DCE 'nobody' is not loaded: it is not installed, or the core has not loaded it yet/)
    assert.equal(hasDce('nobody'), false)
})

test('🔴 a DCE whose factory failed throws WITH the cause, not "not installed"', () => {
    registry()['broken'] = { state: EDceState.FAILED, error: 'ECONNREFUSED 10.0.0.1:5432' }
    assert.throws(() => getDce('broken'), /DCE 'broken' failed to load: ECONNREFUSED 10.0.0.1:5432/)
    assert.equal(hasDce('broken'), false)
})

test('a failed entry without a recorded cause still says it failed', () => {
    registry()['mute'] = { state: EDceState.FAILED }
    assert.throws(() => getDce('mute'), /failed to load: unknown error/)
})
