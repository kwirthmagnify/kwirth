/*
    loadModels (0.5.92): a provider's list is kept with ONE entry per model id. Azure's /models lists 15 ids twice, and a
    list with repeated ids is one whose entries cannot be told apart — the models dialog left the copies on screen.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import back from '../dist/back.js'

const { loadModels } = back

test('loadModels: an openai-compat list with repeated ids keeps one entry per id, the first', async () => {
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'jais-30b-chat' }, { id: 'DeepSeek-R1' }, { id: 'jais-30b-chat', name: 'the copy' }] }))
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    try {
        const provider = { name: 'azure', type: 'openai-compat', key: 'k', endpoint: `http://127.0.0.1:${server.address().port}/openai/v1`, models: [] }
        await loadModels([provider], {})
        assert.deepEqual(provider.models.map(m => [m.id, m.name]), [['jais-30b-chat', 'jais-30b-chat'], ['DeepSeek-R1', 'DeepSeek-R1']])
    }
    finally {
        server.close()
    }
})
