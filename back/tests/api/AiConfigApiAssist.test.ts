import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http, { IncomingMessage, ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { AiConfigApi } from '../../src/api/AiConfigApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { accessKeySerialize, AccessKey, IConfigAiAssistRequest } from '@kwirthmagnify/kwirth-common'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS } from '@kwirthmagnify/kwirth-common-ai'

// POST /core/aiconfig/assist (plans/sender-script/PRD.md, D10/D11, RF11–RF13), end to end against a FAKE
// OpenAI-compatible server on localhost: zero real tokens, and the request the model receives can be
// inspected — which is the only way to prove that no secret and no tool reaches it.

const userKey = { id: 'userkey', type: 'permanent', resources: 'cluster::::' } as unknown as AccessKey
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(userKey), 'Content-Type': 'application/json' }
const storedKeys = [{ accessKey: userKey, description: 'user', expire: Date.now() + 3600_000, days: 1 }]

interface IFakeLlm { base: string, bodies: Record<string, unknown>[], reply: { status: number, content: string }, stop: () => Promise<void> }

/** An OpenAI-compatible Chat Completions endpoint that records what it is sent and answers what it is told. */
const startFakeLlm = async (): Promise<IFakeLlm> => {
    const state: IFakeLlm = { base: '', bodies: [], reply: { status: 200, content: 'echo hi' }, stop: async () => {} }
    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        let raw = ''
        req.on('data', (c: Buffer) => { raw += c.toString() })
        req.on('end', () => {
            state.bodies.push(JSON.parse(raw) as Record<string, unknown>)
            res.writeHead(state.reply.status, { 'Content-Type': 'application/json' })
            if (state.reply.status !== 200) { res.end(JSON.stringify({ error: { message: 'fake model down' } })); return }
            res.end(JSON.stringify({
                id: 'fake', object: 'chat.completion', created: 0, model: 'fake-model',
                choices: [{ index: 0, message: { role: 'assistant', content: state.reply.content }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            }))
        })
    })
    server.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    state.stop = () => new Promise<void>(r => server.close(() => r()))
    return state
}

const startServer = async (llmBase: string) => {
    const provider: ILlmProvider = { name: 'fake', type: 'openai-compat', key: 'fake-key', models: [], endpoint: llmBase }
    const llm: ILlm = { id: 'llm-1', provider: 'fake', model: 'fake-model', temperature: 0, useProviderKey: true, key: '' }
    const cm: IConfigMaps = {
        read: (async (name: string, def?: unknown) => {
            if (name === 'kwirth.keys') return storedKeys
            if (name === 'kwirth-store-common-' + STORAGE_KEY_LLMS) return JSON.stringify([llm])
            return def
        }) as IConfigMaps['read'],
        write: (async () => ({})) as IConfigMaps['write'],
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const secrets: ISecrets = {
        write: (async () => ({})) as ISecrets['write'],
        read: (async (name: string, def?: unknown) => name === 'kwirth-store-common-' + STORAGE_KEY_PROVIDERS
            ? { data: Buffer.from(JSON.stringify([provider]), 'utf8').toString('base64') }
            : def) as ISecrets['read'],
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const apiKeyApi = await ApiKeyApi.create(cm, 'masterx', true)
    const api = new AiConfigApi(secrets, cm, apiKeyApi!)
    const app = express()
    app.use(express.json())
    app.use('/core/aiconfig', api.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

const request = (): IConfigAiAssistRequest => ({
    llmId: 'llm-1',
    fieldName: 'script',
    aiInstructions: 'A shell script; the alarm text arrives on stdin.',
    request: 'POST the alarm text to my webhook',
    fields: [
        { name: 'interpreter', label: 'Interpreter', type: 'select', value: 'bash' },
        { name: 'script', label: 'Script', type: 'textarea', value: '' },
        { name: 'sshPassword', label: 'SSH password', type: 'password', value: 'S3cr3t-pw' },
        { name: 'sshPrivateKey', label: 'SSH private key', type: 'textarea', secret: true, value: 'AAAAkey' },
    ]
})

const withServers = async (fn: (api: string, llm: IFakeLlm) => Promise<void>) => {
    const llm = await startFakeLlm()
    const srv = await startServer(llm.base)
    try { await fn(srv.base, llm) }
    finally { await srv.stop(); await llm.stop() }
}

test('assist: without a key → rejected, and the model is never called', async () => {
    await withServers(async (api, llm) => {
        const res = await fetch(`${api}/core/aiconfig/assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()) })
        assert.ok(res.status === 401 || res.status === 403, `status ${res.status}`)
        assert.equal(llm.bodies.length, 0)
    })
})

test('assist: drafts the value, strips the fence, and the model gets no secret and no tool', async () => {
    await withServers(async (api, llm) => {
        llm.reply = { status: 200, content: '```bash\n#!/bin/bash\ncurl -d @- https://hooks.example\n```' }
        const res = await fetch(`${api}/core/aiconfig/assist`, { method: 'POST', headers: AUTH, body: JSON.stringify(request()) })
        assert.equal(res.status, 200)
        assert.deepEqual(await res.json(), { text: '#!/bin/bash\ncurl -d @- https://hooks.example' })

        assert.equal(llm.bodies.length, 1)
        const sent = JSON.stringify(llm.bodies[0])
        assert.ok(!sent.includes('S3cr3t-pw'), 'the password reached the model')
        assert.ok(!sent.includes('AAAAkey'), 'the private key reached the model')
        assert.ok(sent.includes('POST the alarm text to my webhook'))
        assert.ok(sent.includes('Interpreter (interpreter): bash'))
        assert.equal(llm.bodies[0]['tools'], undefined, 'the model must be called with no tools')
    })
})

test('assist: an incomplete request → 400 naming what is missing, without calling the model', async () => {
    await withServers(async (api, llm) => {
        const res = await fetch(`${api}/core/aiconfig/assist`, { method: 'POST', headers: AUTH, body: JSON.stringify({ ...request(), request: '' }) })
        assert.equal(res.status, 400)
        assert.deepEqual(await res.json(), { error: 'missing request' })
        assert.equal(llm.bodies.length, 0)
    })
})

test('assist: an LLM that is not configured → 404', async () => {
    await withServers(async (api, llm) => {
        const res = await fetch(`${api}/core/aiconfig/assist`, { method: 'POST', headers: AUTH, body: JSON.stringify({ ...request(), llmId: 'nope' }) })
        assert.equal(res.status, 404)
        assert.equal(llm.bodies.length, 0)
    })
})

test('assist: the model failing → 502 with an error, not a 200 with an empty text', async () => {
    await withServers(async (api, llm) => {
        llm.reply = { status: 500, content: '' }
        const res = await fetch(`${api}/core/aiconfig/assist`, { method: 'POST', headers: AUTH, body: JSON.stringify(request()) })
        assert.equal(res.status, 502)
        const json = await res.json() as { error?: string }
        assert.ok(typeof json.error === 'string' && json.error.length > 0)
    })
})
