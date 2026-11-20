import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionTag, extensionTagsOf, isExtensionTag } from '../src/ExtensionTag'

/*
    The extension tags catalogue (plans/completed/extension-taxonomy). Tags come from package.json files and manifest
    entries — a third party's among them — so reading them must keep what is in the catalogue and nothing
    else, and never throw.
*/

test('the catalogue: 55 tags, lower-case kebab, no repeats', () => {
    const values: string[] = Object.keys(EExtensionTag).map(k => EExtensionTag[k as keyof typeof EExtensionTag])
    assert.equal(values.length, 55)
    assert.equal(new Set(values).size, values.length)
    for (const v of values) assert.match(v, /^[a-z][a-z0-9-]*$/, v)
})

test('isExtensionTag: only catalogue strings', () => {
    assert.ok(isExtensionTag('ai'))
    assert.ok(isExtensionTag('live-data'))
    for (const bad of ['logs', 'AI', ' ai', 'ai ', '', 'network', 42, null, undefined, {}, ['ai']]) {
        assert.ok(!isExtensionTag(bad), String(bad))
    }
})

test('extensionTagsOf: keeps catalogue tags in their order, drops the rest and the repeats', () => {
    assert.deepEqual(extensionTagsOf(['observability', 'log', 'kubernetes']), [EExtensionTag.OBSERVABILITY, EExtensionTag.LOG, EExtensionTag.KUBERNETES])
    assert.deepEqual(extensionTagsOf(['ai', 'logs', 'ai', 7, null, 'Kubernetes', 'kubernetes']), [EExtensionTag.AI, EExtensionTag.KUBERNETES])
})

test('extensionTagsOf: anything that is not a list is no tags', () => {
    for (const raw of [undefined, null, 'ai', 'ai,log', 3, {}, { 0: 'ai' }, true]) assert.deepEqual(extensionTagsOf(raw), [], String(raw))
    assert.deepEqual(extensionTagsOf([]), [])
})
