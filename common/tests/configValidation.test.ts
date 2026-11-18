import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IConfigFieldDef, applyConfigDefaults, pruneConfig, validateConfig } from '../src/ExtensionConfig'

/*
    Defaults, pruning and validation of an installation configuration (plans/extension-config, S1). The
    back end applies them to every extension family, so what is tested here is the one rule they share.
*/

const fieldsWithErrors = (schema: IConfigFieldDef[], values: Record<string, unknown>): string[] =>
    validateConfig(schema, values).map(e => e.field)

// ── applyConfigDefaults ─────────────────────────────────────────────────────────────────────────────

test('defaults fill only the fields with no value', () => {
    const schema: IConfigFieldDef[] = [
        { name: 'replicas', label: 'Replicas', type: 'number', default: 3 },
        { name: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], default: 'a' },
        { name: 'url', label: 'URL' }
    ]
    assert.deepEqual(applyConfigDefaults(schema, {}), { replicas: 3, mode: 'a' })
    assert.deepEqual(applyConfigDefaults(schema, { replicas: 5 }), { replicas: 5, mode: 'a' })
})

test('a saved falsy value is kept, not replaced by the default', () => {
    const schema: IConfigFieldDef[] = [
        { name: 'on', label: 'On', type: 'boolean', default: true },
        { name: 'n', label: 'N', type: 'number', default: 7 },
        { name: 's', label: 'S', default: 'x' }
    ]
    assert.deepEqual(applyConfigDefaults(schema, { on: false, n: 0, s: '' }), { on: false, n: 0, s: '' })
})

test('defaults keep keys the schema does not declare, and do not touch the input', () => {
    const schema: IConfigFieldDef[] = [{ name: 'a', label: 'A', default: '1' }]
    const input = { old: 'kept' }
    assert.deepEqual(applyConfigDefaults(schema, input), { old: 'kept', a: '1' })
    assert.deepEqual(input, { old: 'kept' })
})

// ── pruneConfig ─────────────────────────────────────────────────────────────────────────────────────

test('pruning drops what the schema no longer declares', () => {
    const schema: IConfigFieldDef[] = [{ name: 'a', label: 'A' }, { name: 'b', label: 'B' }]
    assert.deepEqual(pruneConfig(schema, { a: 1, b: 2, gone: 3 }), { a: 1, b: 2 })
})

test('an empty schema means unknown: nothing is pruned', () => {
    assert.deepEqual(pruneConfig([], { a: 1, b: 2 }), { a: 1, b: 2 })
})

// ── validateConfig: required and enabledWhen ────────────────────────────────────────────────────────

test('a required field with no value is an error, and the message names it', () => {
    const schema: IConfigFieldDef[] = [{ name: 'token', label: 'API token', type: 'password', required: true }]
    for (const empty of [undefined, null, '']) {
        const errors = validateConfig(schema, { token: empty })
        assert.equal(errors.length, 1, `empty value ${String(empty)}`)
        assert.equal(errors[0].field, 'token')
        assert.match(errors[0].message, /API token/)
    }
    assert.deepEqual(validateConfig(schema, { token: 's3cr3t' }), [])
})

test('a required field is only required while it is enabled', () => {
    const schema: IConfigFieldDef[] = [
        { name: 'target', label: 'Target', type: 'select', options: ['local', 'ssh'], default: 'local' },
        { name: 'sshHost', label: 'SSH host', required: true, enabledWhen: { field: 'target', values: ['ssh'] } }
    ]
    assert.deepEqual(fieldsWithErrors(schema, {}), [], 'disabled by the default of target')
    assert.deepEqual(fieldsWithErrors(schema, { target: 'local' }), [])
    assert.deepEqual(fieldsWithErrors(schema, { target: 'ssh' }), ['sshHost'])
    assert.deepEqual(fieldsWithErrors(schema, { target: 'ssh', sshHost: 'h' }), [])
})

test('enabledWhen on a boolean kept as text compares as the boolean', () => {
    const schema: IConfigFieldDef[] = [
        { name: 'wait', label: 'Wait', type: 'boolean' },
        { name: 'timeout', label: 'Timeout', type: 'number', required: true, enabledWhen: { field: 'wait', values: [true] } }
    ]
    assert.deepEqual(fieldsWithErrors(schema, { wait: 'true' }), ['timeout'])
    assert.deepEqual(fieldsWithErrors(schema, { wait: 'false' }), [])
})

test('an optional field with no value is never an error, whatever its type', () => {
    const schema: IConfigFieldDef[] = (['text', 'number', 'boolean', 'password', 'select', 'json', 'multiselect', 'textarea'] as const)
        .map(type => ({ name: type, label: type, type, options: ['a'] }))
    assert.deepEqual(validateConfig(schema, {}), [])
    assert.deepEqual(validateConfig(schema, Object.fromEntries(schema.map(f => [f.name, '']))), [])
})

// ── validateConfig: types ───────────────────────────────────────────────────────────────────────────

test('number: a finite number, or text that is one', () => {
    const schema: IConfigFieldDef[] = [{ name: 'n', label: 'N', type: 'number' }]
    for (const ok of [0, -3, 2.5, '5', '0.25']) assert.deepEqual(fieldsWithErrors(schema, { n: ok }), [], `ok ${String(ok)}`)
    for (const bad of ['abc', NaN, Infinity, true, {}]) assert.deepEqual(fieldsWithErrors(schema, { n: bad }), ['n'], `bad ${String(bad)}`)
})

test('boolean: true/false, or their text', () => {
    const schema: IConfigFieldDef[] = [{ name: 'b', label: 'B', type: 'boolean' }]
    for (const ok of [true, false, 'true', 'false']) assert.deepEqual(fieldsWithErrors(schema, { b: ok }), [], `ok ${String(ok)}`)
    for (const bad of ['yes', 1, 'TRUE']) assert.deepEqual(fieldsWithErrors(schema, { b: bad }), ['b'], `bad ${String(bad)}`)
})

test('select: one of the options; with no options anything textual goes', () => {
    const schema: IConfigFieldDef[] = [{ name: 's', label: 'S', type: 'select', options: ['ClusterIP', 'NodePort'] }]
    assert.deepEqual(fieldsWithErrors(schema, { s: 'NodePort' }), [])
    assert.deepEqual(fieldsWithErrors(schema, { s: 'nodeport' }), ['s'], 'exact match')
    assert.deepEqual(fieldsWithErrors(schema, { s: 3 }), ['s'])
    assert.deepEqual(fieldsWithErrors([{ name: 's', label: 'S', type: 'select' }], { s: 'free' }), [])
})

test('multiselect: every comma-separated value among the options', () => {
    const schema: IConfigFieldDef[] = [{ name: 'm', label: 'M', type: 'multiselect', options: ['a', 'b', 'c'] }]
    assert.deepEqual(fieldsWithErrors(schema, { m: 'a,c' }), [])
    assert.deepEqual(fieldsWithErrors(schema, { m: 'a, b ,' }), [], 'spaces and a trailing comma')
    const errors = validateConfig(schema, { m: 'a,x,y' })
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /x, y/)
    assert.deepEqual(fieldsWithErrors([{ name: 'm', label: 'M', type: 'multiselect' }], { m: 'kube-system,kwirth' }), [], 'no options: typed by hand')
})

test('json: text that parses', () => {
    const schema: IConfigFieldDef[] = [{ name: 'j', label: 'J', type: 'json' }]
    assert.deepEqual(fieldsWithErrors(schema, { j: '{"a":1}' }), [])
    assert.deepEqual(fieldsWithErrors(schema, { j: '{a:1}' }), ['j'])
    assert.deepEqual(fieldsWithErrors(schema, { j: { a: 1 } }), ['j'], 'an object is not the text the form sends')
})

test('text, password, textarea and an absent type: text', () => {
    const schema: IConfigFieldDef[] = [
        { name: 't', label: 'T', type: 'text' },
        { name: 'p', label: 'P', type: 'password' },
        { name: 'a', label: 'A', type: 'textarea', secret: true },
        { name: 'u', label: 'U' }
    ]
    assert.deepEqual(validateConfig(schema, { t: 'x', p: 'y', a: 'line1\nline2', u: 'z' }), [])
    assert.deepEqual(fieldsWithErrors(schema, { t: 1, p: true, a: {}, u: [] }), ['t', 'p', 'a', 'u'])
})

test('keys the schema does not declare are not errors', () => {
    assert.deepEqual(validateConfig([{ name: 'a', label: 'A' }], { a: 'x', other: 42 }), [])
})

test('every failing field is reported, not just the first', () => {
    const schema: IConfigFieldDef[] = [
        { name: 'a', label: 'A', required: true },
        { name: 'b', label: 'B', type: 'number' },
        { name: 'c', label: 'C', type: 'boolean' }
    ]
    assert.deepEqual(fieldsWithErrors(schema, { b: 'x', c: 'x' }), ['a', 'b', 'c'])
})
