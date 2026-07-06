// Fase 1 (IAgent) tests: tool selection (selectAgentToolNames) and runAgent error paths.
// Runs against the compiled dist (build first). node:test + node:assert, no extra deps.

import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'

const { selectAgentToolNames, runAgent, toolInfoList, EToolEffect } = back

const agent = (over) => ({
    id: 'a', name: 'a', description: '', cluster: '', llm: 'x',
    system: '', tools: [], autoTools: false, steps: 10, readOnly: false, ...over
})

const writeNames = toolInfoList.filter(t => t.effect === EToolEffect.WRITE).map(t => t.name)

test('autoTools exposes the full catalog', () => {
    assert.equal(selectAgentToolNames(agent({ autoTools: true })).length, toolInfoList.length)
})

test('readOnly filters out every WRITE tool', () => {
    const names = selectAgentToolNames(agent({ autoTools: true, readOnly: true }))
    for (const w of writeNames) assert.equal(names.includes(w), false)
    assert.equal(names.length, toolInfoList.length - writeNames.length)
})

test('explicit list is intersected with the catalog (unknown tools dropped)', () => {
    const names = selectAgentToolNames(agent({ tools: ['add_replica', 'list_namespaces', 'nonexistent'] }))
    assert.deepEqual([...names].sort(), ['add_replica', 'list_namespaces'])
})

test('explicit list + readOnly drops WRITE from the list', () => {
    assert.deepEqual(selectAgentToolNames(agent({ tools: ['add_replica', 'list_namespaces'], readOnly: true })), ['list_namespaces'])
})

test('runAgent throws when the llm is not found', async () => {
    await assert.rejects(() => runAgent(agent({ llm: 'missing' }), 'hi', [], [], {}), /llm 'missing' not found/)
})

test('runAgent throws when the model cannot be built (no key)', async () => {
    const llms = [{ id: 'x', provider: 'openai', model: 'gpt-4', temperature: 0, useProviderKey: false, key: '' }]
    await assert.rejects(() => runAgent(agent({ llm: 'x' }), 'hi', llms, [], {}), /could not build model/)
})
