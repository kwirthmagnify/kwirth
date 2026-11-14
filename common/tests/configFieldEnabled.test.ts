import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IConfigFieldDef, isConfigFieldEnabled } from '../src/ExtensionConfig'

/*
    IConfigFieldDef.enabledWhen (plans/sender-script, stream C): both config forms grey a field out with
    this same function, so what is tested here is what they agree on.
*/

const target: IConfigFieldDef = { name: 'target', label: 'Run on', type: 'select', options: ['local', 'ssh'], default: 'local' }
const host: IConfigFieldDef = { name: 'sshHost', label: 'SSH host', enabledWhen: { field: 'target', values: ['ssh'] } }
const plain: IConfigFieldDef = { name: 'name', label: 'Name' }
const schema = [target, host, plain]

test('a field without enabledWhen is always enabled', () => {
    assert.equal(isConfigFieldEnabled(plain, schema, {}), true)
    assert.equal(isConfigFieldEnabled(target, schema, { target: 'whatever' }), true)
})

test('enabled only while the other field holds one of the values', () => {
    assert.equal(isConfigFieldEnabled(host, schema, { target: 'ssh' }), true)
    assert.equal(isConfigFieldEnabled(host, schema, { target: 'local' }), false)
    assert.equal(isConfigFieldEnabled(host, schema, { target: 'SSH' }), false, 'exact match, no case folding')
})

test('with no value yet, the other field\'s default decides', () => {
    assert.equal(isConfigFieldEnabled(host, schema, {}), false)
    const sshByDefault = [{ ...target, default: 'ssh' }, host]
    assert.equal(isConfigFieldEnabled(host, sshByDefault, {}), true)
    assert.equal(isConfigFieldEnabled(host, [host], {}), false, 'unknown field and no value: disabled')
})

test('booleans compare as booleans, not as text', () => {
    const sw: IConfigFieldDef = { name: 'wait', label: 'Wait', type: 'boolean', default: true }
    const timeout: IConfigFieldDef = { name: 'timeoutSeconds', label: 'Timeout', type: 'number', enabledWhen: { field: 'wait', values: [true] } }
    assert.equal(isConfigFieldEnabled(timeout, [sw, timeout], {}), true)
    assert.equal(isConfigFieldEnabled(timeout, [sw, timeout], { wait: false }), false)
    assert.equal(isConfigFieldEnabled(timeout, [sw, timeout], { wait: 'true' }), false)
})
