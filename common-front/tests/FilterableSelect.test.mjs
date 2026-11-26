// The pure helper of FilterableSelect (0.5.84), against the built package: `npm run build` first, then `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { filterSelectOptions, FilterableSelect } = require('../dist/index.js')

const options = [
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5.5-mini', label: 'GPT-5.5 mini' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', disabled: true }
]
const values = r => r.options.map(o => o.value)

test('filterSelectOptions: an empty filter, or only spaces, keeps every option and offers nothing typed', () => {
    assert.deepEqual(values(filterSelectOptions(options, '', true)), ['gpt-5.5', 'gpt-5.5-mini', 'gemini-2.5-pro'])
    assert.equal(filterSelectOptions(options, '   ', true).custom, undefined)
})

test('filterSelectOptions: by label or by value, any case, trimmed; disabled options are still listed', () => {
    assert.deepEqual(values(filterSelectOptions(options, ' 5.5 MINI ', false)), ['gpt-5.5-mini'])
    // a plain substring: "mini" is also inside "gemini"
    assert.deepEqual(values(filterSelectOptions(options, 'mini', false)), ['gpt-5.5-mini', 'gemini-2.5-pro'])
    assert.deepEqual(values(filterSelectOptions(options, 'gemini-2.5', false)), ['gemini-2.5-pro'])
    assert.deepEqual(values(filterSelectOptions(options, '2.5 pro', false)), ['gemini-2.5-pro'])
    assert.deepEqual(values(filterSelectOptions(options, 'nothing like it', false)), [])
    assert.deepEqual(values(filterSelectOptions([], 'x', false)), [])
})

test('filterSelectOptions: without allowCustom, what is typed is never a value', () => {
    assert.equal(filterSelectOptions(options, 'my-deployment', false).custom, undefined)
})

test('filterSelectOptions: with allowCustom, the typed text (trimmed) unless an option is exactly it', () => {
    assert.equal(filterSelectOptions(options, '  my-deployment ', true).custom, 'my-deployment')
    // a part of a value is still offered: "gpt" is not an option, and it may be a deployment's name
    assert.equal(filterSelectOptions(options, 'gpt', true).custom, 'gpt')
    assert.equal(filterSelectOptions(options, 'gpt-5.5', true).custom, undefined)
    // exact, case included: a deployment called GPT-5.5 is not gpt-5.5
    assert.equal(filterSelectOptions(options, 'GPT-5.5', true).custom, 'GPT-5.5')
})

test('filterSelectOptions: a value repeated in the list is shown ONCE, filtered or not — the first one wins', () => {
    const repeated = [
        { value: 'jais-30b-chat', label: 'jais (first)' },
        { value: 'DeepSeek-R1', label: 'DeepSeek-R1' },
        { value: 'jais-30b-chat', label: 'jais (second)' }
    ]
    assert.deepEqual(filterSelectOptions(repeated, '', false).options.map(o => o.label), ['jais (first)', 'DeepSeek-R1'])
    assert.deepEqual(filterSelectOptions(repeated, 'dee', false).options.map(o => o.value), ['DeepSeek-R1'])
})

test('FilterableSelect is exported as a component', () => {
    assert.equal(typeof FilterableSelect, 'function')
})
