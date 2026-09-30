// The DCE tab's logic (src/front/StatusDces.ts). The finding that matters is a BROKEN half: a DCE whose
// back or front did not load fails every consumer that asks for it, and nothing else on screen says so.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DCE_REGISTRY, EDceState, TDceRegistry } from '@kwirthmagnify/kwirth-common'
import { filterDces, frontPartOf, isBroken, partLabel, readFrontRegistry, sortDces, summarizeDces } from '../../src/front/StatusDces'
import { IStatusDce } from '../../src/common/StatusTypes'

const dce = (id: string, over: Partial<IStatusDce> = {}): IStatusDce => ({
    id,
    name: id,
    version: '1.0.0',
    hasBack: true,
    hasFront: false,
    back: { state: EDceState.LOADED },
    consumers: [],
    ...over
})

test('a half that does not exist is "—", not a fault', () => {
    assert.deepEqual(partLabel(false, undefined), { label: '—', color: 'default' })
})

test('a half that exists and did not load is "Not loaded", a warning', () => {
    assert.deepEqual(partLabel(true, undefined), { label: 'Not loaded', color: 'warning' })
})

test('loaded is success, failed is error', () => {
    assert.deepEqual(partLabel(true, { state: EDceState.LOADED }), { label: 'Loaded', color: 'success' })
    assert.deepEqual(partLabel(true, { state: EDceState.FAILED, error: 'boom' }), { label: 'Failed', color: 'error' })
})

test('the front half is read from the page registry, with its error', () => {
    const registry: TDceRegistry = { a: { state: EDceState.FAILED, error: 'front.js could not be downloaded' } }
    assert.deepEqual(frontPartOf(dce('a', { hasFront: true }), registry), { state: EDceState.FAILED, error: 'front.js could not be downloaded' })
    // Not in the registry: this page has not loaded it.
    assert.equal(frontPartOf(dce('b', { hasFront: true }), registry), undefined)
    // No front end: there is nothing to read, whatever the registry holds.
    assert.equal(frontPartOf(dce('a', { hasFront: false }), registry), undefined)
})

test('🔴 the live instance never leaks into the part: only state and error', () => {
    const registry: TDceRegistry = { a: { state: EDceState.LOADED, instance: { secret: 'x' } } }
    assert.deepEqual(frontPartOf(dce('a', { hasFront: true }), registry), { state: EDceState.LOADED })
})

test('🔴 broken = either half failed or missing; a missing half that does not exist is fine', () => {
    assert.equal(isBroken(dce('ok'), {}), false)
    assert.equal(isBroken(dce('back-failed', { back: { state: EDceState.FAILED, error: 'x' } }), {}), true)
    assert.equal(isBroken(dce('back-missing', { back: undefined }), {}), true)
    assert.equal(isBroken(dce('no-back', { hasBack: false, back: undefined }), {}), false)
    assert.equal(isBroken(dce('front-missing', { hasFront: true }), {}), true)
    assert.equal(isBroken(dce('front-ok', { hasFront: true }), { 'front-ok': { state: EDceState.LOADED } }), false)
})

test('broken ones sort first, then by id', () => {
    const list = [dce('c'), dce('b', { back: { state: EDceState.FAILED } }), dce('a')]
    assert.deepEqual(sortDces(list, {}).map(d => d.id), ['b', 'a', 'c'])
    // It does not reorder the input.
    assert.deepEqual(list.map(d => d.id), ['c', 'b', 'a'])
})

test('the filter matches id, name, version and consumer, case-insensitive', () => {
    const list = [
        dce('nettools', { name: 'Net Tools', version: '0.1.0', consumers: [{ type: 'plugin', id: 'nettools-ui' }] }),
        dce('sample', { version: '2.3.4' })
    ]
    assert.deepEqual(filterDces(list, '').map(d => d.id), ['nettools', 'sample'])
    assert.deepEqual(filterDces(list, 'NET').map(d => d.id), ['nettools'])
    assert.deepEqual(filterDces(list, 'tools-ui').map(d => d.id), ['nettools'])
    assert.deepEqual(filterDces(list, 'plugin').map(d => d.id), ['nettools'])
    assert.deepEqual(filterDces(list, '2.3').map(d => d.id), ['sample'])
    assert.deepEqual(filterDces(list, 'zzz').map(d => d.id), [])
})

test('the summary counts DCEs, broken ones, DISTINCT consumers and unused ones', () => {
    const list = [
        dce('a', { consumers: [{ type: 'plugin', id: 'x' }, { type: 'provider', id: 'x' }] }),
        dce('b', { consumers: [{ type: 'plugin', id: 'x' }], back: { state: EDceState.FAILED } }),
        dce('c')
    ]
    // plugin:x twice counts once; provider:x is a different extension.
    assert.deepEqual(summarizeDces(list, {}), { total: 3, broken: 1, consumers: 2, unused: 1 })
    assert.deepEqual(summarizeDces([], {}), { total: 0, broken: 0, consumers: 0, unused: 0 })
})

test('the page registry is read from the global, and is empty when there is none', () => {
    const g = globalThis as unknown as Record<string, TDceRegistry | undefined>
    const before = g[DCE_REGISTRY]
    try {
        delete g[DCE_REGISTRY]
        assert.deepEqual(readFrontRegistry(), {})
        g[DCE_REGISTRY] = { a: { state: EDceState.LOADED } }
        assert.deepEqual(readFrontRegistry(), { a: { state: EDceState.LOADED } })
    }
    finally {
        if (before === undefined) delete g[DCE_REGISTRY]
        else g[DCE_REGISTRY] = before
    }
})
