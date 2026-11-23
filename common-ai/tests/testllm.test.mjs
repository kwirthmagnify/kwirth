/*
    testLlm (0.5.84): the Test button of the AI models dialog. What is pinned down: it NEVER throws — a model
    that cannot be built, or a provider that does not answer, is a result with what went wrong, because
    that is what the admin has to read.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import back from '../dist/back.js'

const { testLlm } = back

const llm = (provider, model = 'gpt-5.5') => ({ id: 'test', provider, model, temperature: 0, useProviderKey: true, key: '' })

test('testLlm: a provider that does not exist is a failed result, not an exception', async () => {
    const r = await testLlm(llm('nowhere'), [])
    assert.equal(r.ok, false)
    assert.equal(r.ms, 0)
    assert.match(r.error, /provider 'nowhere' is missing/)
})

test('testLlm: an OpenAI-compatible endpoint that answers — the text, trimmed, and the tokens', async () => {
    let body
    const server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', c => { raw += c })
        req.on('end', () => {
            body = { url: req.url, auth: req.headers.authorization, json: JSON.parse(raw) }
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({
                id: 'x', object: 'chat.completion', created: 0, model: 'gpt-5.5',
                choices: [{ index: 0, message: { role: 'assistant', content: ' OK \n' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }
            }))
        })
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/openai/v1`
        const r = await testLlm(llm('azure'), [{ name: 'azure', type: 'openai-compat', key: 'k1', endpoint, models: [] }])
        assert.equal(r.ok, true, r.error)
        assert.equal(r.text, 'OK')
        assert.equal(r.inputTokens, 12)
        assert.equal(r.outputTokens, 3)
        assert.ok(r.ms >= 0)
        // the deployment is chosen by `model`, on the endpoint of the resource
        assert.equal(body.url, '/openai/v1/chat/completions')
        assert.equal(body.json.model, 'gpt-5.5')
        assert.equal(body.auth, 'Bearer k1')
    }
    finally {
        server.close()
    }
})

test('testLlm: what the provider says when it refuses is the error', async () => {
    const server = http.createServer((_req, res) => {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'DeploymentNotFound', message: 'The API deployment for this resource does not exist.' } }))
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/openai/v1`
        const r = await testLlm(llm('azure', 'nope'), [{ name: 'azure', type: 'openai-compat', key: 'k1', endpoint, models: [] }])
        assert.equal(r.ok, false)
        assert.match(r.error, /deployment for this resource does not exist/)
    }
    finally {
        server.close()
    }
})
