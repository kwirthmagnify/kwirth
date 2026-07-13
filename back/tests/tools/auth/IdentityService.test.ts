import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IdentityService } from '../../../src/tools/auth/IdentityService'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../../../src/tools/ISecrets'
import { IConfigMaps } from '../../../src/tools/IConfigMap'

// ---- helpers ----
const makeUser = (over: Partial<IUser> = {}): IUser => ({
    id: 'alice@example.com',
    name: 'Alice',
    password: '',
    accessKey: { id: '', type: 'volatile', resources: '' } as any,
    resources: 'cluster::::',
    ...over
})

const encodeUsers = (users: IUser[]): { [k:string]: string } => {
    const out: { [k:string]: string } = {}
    for (const u of users) out[u.id] = btoa(JSON.stringify(u))
    return out
}

// mock de ISecrets con control por-nombre
const mockSecrets = (map: Record<string, any>, failing: string[] = []): ISecrets => ({
    read: async (name: string) => {
        if (failing.includes(name)) throw new Error(`no such secret ${name}`)
        if (!(name in map)) throw new Error(`no such secret ${name}`)
        return map[name]
    },
    write: async () => {},
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

// ---- readUsers ----
test('readUsers devuelve el secret kwirth-users', async () => {
    const users = encodeUsers([makeUser()])
    const secrets = mockSecrets({ 'kwirth-users': users })
    const got = await IdentityService.readUsers(secrets)
    assert.deepEqual(got, users)
})

test('readUsers cae al fallback kwirth.users si kwirth-users no existe', async () => {
    const users = encodeUsers([makeUser()])
    const secrets = mockSecrets({ 'kwirth.users': users }, ['kwirth-users'])
    const got = await IdentityService.readUsers(secrets)
    assert.deepEqual(got, users)
})

test('readUsers devuelve undefined si no hay ningun secret', async () => {
    const secrets = mockSecrets({}, ['kwirth-users', 'kwirth.users'])
    const got = await IdentityService.readUsers(secrets)
    assert.equal(got, undefined)
})

// ---- findUser ----
test('findUser deserializa un usuario existente', () => {
    const u = makeUser({ id: 'bob@example.com', name: 'Bob' })
    const users = encodeUsers([u])
    const got = IdentityService.findUser(users, 'bob@example.com')
    assert.equal(got?.id, 'bob@example.com')
    assert.equal(got?.name, 'Bob')
})

test('findUser devuelve undefined si el id no existe', () => {
    const users = encodeUsers([makeUser()])
    assert.equal(IdentityService.findUser(users, 'nadie@example.com'), undefined)
})

test('findUser devuelve undefined si el contenido esta corrupto', () => {
    const users = { 'x@example.com': 'no-es-base64-json-valido!!' }
    assert.equal(IdentityService.findUser(users, 'x@example.com'), undefined)
})

// ---- createApiKey ----
test('createApiKey crea una key permanent con los resources del usuario y actualiza apiKeyApi', async () => {
    const user = makeUser({ resources: 'view:default:::' })
    let written: { name: string, data: any } | undefined
    const configMaps: IConfigMaps = {
        read: async (_name: string, def?: any) => def ?? [],
        write: ((name: string, data: any) => { written = { name, data } }) as any,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const apiKeyApi: any = { apiKeys: [] }

    const before = Date.now()
    const apiKey = await IdentityService.createApiKey(user, '1.2.3.4', configMaps, apiKeyApi)
    const after = Date.now()

    assert.ok(apiKey, 'debe devolver una ApiKey')
    assert.equal(apiKey!.accessKey.type, 'permanent')
    assert.equal(apiKey!.accessKey.resources, 'view:default:::')
    assert.match(apiKey!.description, /alice@example\.com/)
    assert.match(apiKey!.description, /1\.2\.3\.4/)
    assert.equal(apiKey!.days, 1)
    // expira ~24h desde ahora
    assert.ok(apiKey!.expire >= before + 24*60*60*1000)
    assert.ok(apiKey!.expire <= after + 24*60*60*1000)
    // persistido en configmap kwirth.keys
    assert.equal(written?.name, 'kwirth.keys')
    assert.ok(Array.isArray(written?.data) && written!.data.some((k: any) => k.accessKey.id === apiKey!.accessKey.id))
    // cache de apiKeyApi refrescada
    assert.ok(apiKeyApi.apiKeys.some((k: any) => k.accessKey.id === apiKey!.accessKey.id))
})

test('createApiKey purga keys caducadas al persistir', async () => {
    const user = makeUser()
    const expired = { accessKey: { id: 'old', type: 'permanent', resources: '' }, description: 'old', expire: Date.now() - 1000, days: 1 }
    let written: any[] | undefined
    const configMaps: IConfigMaps = {
        read: async () => [expired],
        write: ((_name: string, data: any) => { written = data }) as any,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const apiKeyApi: any = { apiKeys: [] }
    await IdentityService.createApiKey(user, 'ip', configMaps, apiKeyApi)
    assert.ok(written && !written.some(k => k.accessKey.id === 'old'), 'la key caducada no debe persistir')
})

// ---- writeUsers / readUsers con email (clave K8s válida) ----
test('writeUsers codifica la clave del Secret como base64url (sin @) y readUsers re-indexa por email', async () => {
    let store: any = undefined
    const secrets: ISecrets = {
        read: async (name: string) => { if (name === 'kwirth-users' && store) return store; throw new Error('no such secret') },
        write: async (name: string, content: any) => { if (name === 'kwirth-users') store = content },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const email = 'jfvilas@gmail.com'
    const usersMap = { [email]: btoa(JSON.stringify(makeUser({ id: email, idp: 'google' }))) }

    await IdentityService.writeUsers(secrets, usersMap)

    // la clave del data del Secret NO puede contener '@' (regla de K8s); debe ser base64url válida
    const keys = Object.keys(store)
    assert.equal(keys.length, 1)
    assert.ok(!keys[0].includes('@'), 'la clave del Secret no debe contener @')
    assert.match(keys[0], /^[-._a-zA-Z0-9]+$/)

    // readUsers re-indexa por el id real (email), decodificando el valor
    const got = await IdentityService.readUsers(secrets)
    assert.ok(got && got[email], 'readUsers debe devolver el usuario indexado por su email')
    const user = IdentityService.findUser(got!, email)
    assert.equal(user?.id, email)
    assert.equal(user?.idp, 'google')
})

// ---- okResponse ----
test('okResponse expone id, name, accessKey y prefs de UI (nunca password)', () => {
    const user = makeUser({ password: 'secreto' })
    const resp = IdentityService.okResponse(user)
    assert.deepEqual(Object.keys(resp).sort(), ['accessKey', 'enabledChannels', 'exitFullScreen', 'id', 'name', 'startChannel'])
    assert.equal((resp as any).password, undefined)
})
