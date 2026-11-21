import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { USER, PASS } from './helpers'

/*
    A toolset's SETTINGS through the API (plans/extension-config, S8; the screen comes in S9): declared by
    its configSchema, the defaults when nothing is saved, the token REAL on GET, what does not fit refused
    field by field, and kept on uninstall with its grants unless asked (P5).

    The toolset is a fixture written here (one tool, it talks to nothing) uploaded through the API.
    Non-destructive: it was not there before, and afterAll removes it with its settings and grants.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const ID = 'e2e-toolset-config'

interface IAccessKey { id: string, type: string, resources: string }

const toolsetTgz = (): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-e2e-${ID}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: ID, name: `@e2e/kwirth-aitoolset-${ID}`, displayName: 'E2E Toolset Config', version: '0.1.0', description: 'e2e toolset with settings', extensionType: 'aitoolset' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `module.exports.default = {
        id: '${ID}', version: '0.1.0', displayName: 'E2E Toolset Config', description: 'e2e', requires: [],
        configSchema: [
            { name: 'namespace', label: 'Namespace', required: true, default: 'default' },
            { name: 'mode', label: 'Mode', type: 'select', options: ['plan', 'apply'], default: 'plan' },
            { name: 'token', label: 'Token', type: 'password' }
        ],
        tools: [{ name: 'echo', description: 'echo', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async (args, host) => host.config }]
    }`)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return fs.readFileSync(tgz)
}

test.describe.configure({ mode: 'serial' })

test.describe('AI toolset settings (API): defaults, saved real, refused by field, kept on uninstall with the grants', () => {
    let api: APIRequestContext
    let auth: Record<string, string>

    const install = async () => {
        const res = await api.post('/core/aitoolsets/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: toolsetTgz() })
        expect(res.status(), await res.text()).toBe(200)
    }
    const config = async () => (await api.get(`/core/aitoolsets/${ID}/config`, { headers: auth })).json()
    const grants = async () => ((await (await api.get('/core/aitoolsets/grants', { headers: auth })).json()) as Record<string, unknown>)[ID]
    const uninstall = async (deleteConfig: boolean) => {
        const res = await api.delete(`/core/aitoolsets/${ID}${deleteConfig ? '?deleteConfig=true' : ''}`, { headers: auth })
        expect(res.status()).toBe(200)
    }

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/aitoolsets', { headers: auth })).json() as { id: string }[]
        expect(installed.some(t => t.id === ID), 'the fixture must not be there before').toBe(false)
    })

    test.afterAll(async () => {
        await api?.delete(`/core/aitoolsets/${ID}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.dispose()
    })

    test('installed: the catalogue carries its configSchema, and nothing saved gives the defaults', async () => {
        await install()
        const infos = await (await api.get('/core/aitoolsets/catalog', { headers: auth })).json() as { id: string, configSchema?: { name: string }[] }[]
        expect(infos.find(t => t.id === ID)?.configSchema?.map(f => f.name)).toEqual(['namespace', 'mode', 'token'])
        expect(await config()).toEqual({ namespace: 'default', mode: 'plan' })
    })

    test('🔴 what does not fit is refused naming every field, and nothing is saved', async () => {
        const res = await api.put(`/core/aitoolsets/${ID}/config`, { headers: auth, data: { namespace: '', mode: 'destroy' } })
        expect(res.status()).toBe(400)
        const body = await res.json() as { fields: { field: string }[] }
        expect(body.fields.map(f => f.field).sort()).toEqual(['mode', 'namespace'])
        expect(await config()).toEqual({ namespace: 'default', mode: 'plan' })
    })

    test('🔴 saved, it comes back with the token REAL', async () => {
        const res = await api.put(`/core/aitoolsets/${ID}/config`, { headers: auth, data: { namespace: 'apps', mode: 'apply', token: 'e2e-token' } })
        expect(res.status(), await res.text()).toBe(200)
        expect(await config()).toEqual({ namespace: 'apps', mode: 'apply', token: 'e2e-token' })
    })

    test('🔴 uninstalled WITHOUT deleteConfig: settings and grants are kept, and a reinstall has them', async () => {
        const put = await api.put(`/core/aitoolsets/grants/${ID}`, { headers: auth, data: { grants: [{ pluginId: 'e2e-plugin', allTools: true, tools: [] }] } })
        expect(put.status(), await put.text()).toBe(200)
        await uninstall(false)
        expect((await api.get(`/core/aitoolsets/${ID}/config`, { headers: auth })).status(), 'not registered meanwhile').toBe(404)
        await install()
        expect(await config()).toEqual({ namespace: 'apps', mode: 'apply', token: 'e2e-token' })
        expect(await grants()).toEqual([{ pluginId: 'e2e-plugin', allTools: true, tools: [] }])
    })

    test('🔴 uninstalled WITH deleteConfig: settings and grants go, and a reinstall starts from the defaults', async () => {
        await uninstall(true)
        await install()
        expect(await config()).toEqual({ namespace: 'default', mode: 'plan' })
        expect(await grants()).toBeUndefined()
        await uninstall(true)
    })

    test('a toolset that is not registered: 404, not an empty config', async () => {
        expect((await api.get('/core/aitoolsets/e2e-nobody/config', { headers: auth })).status()).toBe(404)
        expect((await api.put('/core/aitoolsets/e2e-nobody/config', { headers: auth, data: {} })).status()).toBe(404)
    })
})
