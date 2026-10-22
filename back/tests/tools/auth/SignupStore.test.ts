import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESignupStatus, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { SignupStore, SIGNUP_PENDING_CAP } from '../../../src/tools/auth/SignupStore'
import { IdentityService } from '../../../src/tools/auth/IdentityService'
import { ISecrets } from '../../../src/tools/ISecrets'

/*
    The signup requests' store (plan: plans/signup, S1). What it defends: that they live in their OWN
    Secret and never in 'kwirth-users' (D1), that an email can be a key, and that what does not look like a
    request is not trusted.
*/

// an in-memory ISecrets that behaves like the real ones on writeKey/readAllKeys: null deletes the key
const memorySecrets = () => {
    const store: Record<string, Record<string, unknown>> = {}
    const secrets: ISecrets = {
        read: async (name: string) => { if (!store[name]) throw new Error(`no such secret ${name}`); return store[name] },
        write: async (name: string, content: {}) => { store[name] = { ...content } },
        writeKey: async (name: string, key: string, value: unknown) => {
            store[name] = store[name] ?? {}
            if (value === null) delete store[name][key]
            else store[name][key] = JSON.parse(JSON.stringify(value))
        },
        readAllKeys: async (name: string) => ({ ...(store[name] ?? {}) }),
        storeLimit: () => undefined
    }
    return { secrets, store }
}

const request = (over: Partial<ISignupRequest> = {}): ISignupRequest => ({
    id: 'bob@example.com',
    idp: 'google',
    name: 'Bob',
    comment: 'I am on the platform team',
    requestedAt: 1_760_000_000_000,
    status: ESignupStatus.PENDING,
    ...over
})

test('lo guardado se lee igual, y va a kwirth-signups, NO a kwirth-users', async () => {
    const { secrets, store } = memorySecrets()
    await SignupStore.save(secrets, request())
    assert.deepEqual(await SignupStore.get(secrets, 'bob@example.com'), request())
    assert.ok(store['kwirth-signups'], 'the request has its own Secret')
    assert.equal(store['kwirth-users'], undefined, 'a request is never a user')
})

test('la clave es base64url del email: un Secret de K8s no admite @', async () => {
    const { secrets, store } = memorySecrets()
    await SignupStore.save(secrets, request())
    const keys = Object.keys(store['kwirth-signups'])
    assert.deepEqual(keys, [Buffer.from('bob@example.com', 'utf8').toString('base64url')])
    assert.match(keys[0], /^[A-Za-z0-9_-]+$/)
})

test('guardar otra vez el mismo email lo reemplaza, no lo duplica', async () => {
    const { secrets } = memorySecrets()
    await SignupStore.save(secrets, request())
    await SignupStore.save(secrets, request({ status: ESignupStatus.REJECTED }))
    const all = await SignupStore.list(secrets)
    assert.equal(all.length, 1)
    assert.equal(all[0].status, ESignupStatus.REJECTED)
})

test('remove borra solo esa peticion', async () => {
    const { secrets } = memorySecrets()
    await SignupStore.save(secrets, request())
    await SignupStore.save(secrets, request({ id: 'carol@example.com' }))
    await SignupStore.remove(secrets, 'bob@example.com')
    assert.deepEqual((await SignupStore.list(secrets)).map(r => r.id), ['carol@example.com'])
    assert.equal(await SignupStore.get(secrets, 'bob@example.com'), undefined)
})

test('sin Secret todavia, la lista esta vacia y no lanza', async () => {
    const { secrets } = memorySecrets()
    assert.deepEqual(await SignupStore.list(secrets), [])
    assert.equal(await SignupStore.countPending(secrets, 'google'), 0)
})

test('un Secret que no se puede leer da lista vacia, no una excepcion', async () => {
    const { secrets } = memorySecrets()
    secrets.readAllKeys = async () => { throw new Error('forbidden') }
    assert.deepEqual(await SignupStore.list(secrets), [])
})

test('lo que no parece una peticion se descarta: sin id, sin idp, o con un estado que no existe', async () => {
    const { secrets, store } = memorySecrets()
    await SignupStore.save(secrets, request())
    store['kwirth-signups']['x1'] = { idp: 'google', status: 'pending' }
    store['kwirth-signups']['x2'] = { id: 'eve@example.com', status: 'pending' }
    store['kwirth-signups']['x3'] = { id: 'eve@example.com', idp: 'google', status: 'approved' }
    store['kwirth-signups']['x4'] = 'not-json-at-all'
    assert.deepEqual((await SignupStore.list(secrets)).map(r => r.id), ['bob@example.com'])
})

test('countPending cuenta solo las pendientes de ESE IdP', async () => {
    const { secrets } = memorySecrets()
    await SignupStore.save(secrets, request({ id: 'a@example.com' }))
    await SignupStore.save(secrets, request({ id: 'b@example.com' }))
    await SignupStore.save(secrets, request({ id: 'c@example.com', status: ESignupStatus.REJECTED }))
    await SignupStore.save(secrets, request({ id: 'd@example.com', idp: 'entra' }))
    assert.equal(await SignupStore.countPending(secrets, 'google'), 2)
    assert.equal(await SignupStore.countPending(secrets, 'entra'), 1)
    assert.equal(await SignupStore.countPending(secrets, 'gitlab'), 0)
})

/*
    🔴 The single lock (D6). It used to be one semaphore in UserApi and another in LoginApi, which
    serialised each API with itself and not with the other. What is pinned here is that there is ONE, and
    that it serialises: the second holder starts only when the first has finished.
*/
test('IdentityService.lock serializa: el segundo no entra hasta que el primero sale', async () => {
    const order: string[] = []
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    const first = IdentityService.lock.use(async () => { order.push('first:in'); await held; order.push('first:out') })
    const second = IdentityService.lock.use(async () => { order.push('second:in') })
    await new Promise(r => setTimeout(r, 20))
    assert.deepEqual(order, ['first:in'], 'the second one must be waiting')
    release()
    await Promise.all([first, second])
    assert.deepEqual(order, ['first:in', 'first:out', 'second:in'])
})

// ---- the IdP's policy (S2) ----

test('allows: sin politica, o deshabilitada, es que no', () => {
    assert.equal(SignupStore.allows(undefined, 'bob@example.com'), false)
    assert.equal(SignupStore.allows({ enabled: false, allowedDomains: [] }, 'bob@example.com'), false)
})

test('allows: sin dominios, cualquiera', () => {
    assert.equal(SignupStore.allows({ enabled: true, allowedDomains: [] }, 'bob@anything.org'), true)
    assert.equal(SignupStore.allows({ enabled: true, allowedDomains: ['  ', ''] }, 'bob@anything.org'), true, 'blank entries are no filter')
})

test('allows: el dominio se compara ENTERO y sin mayusculas', () => {
    const policy = { enabled: true, allowedDomains: [' Example.COM '] }
    assert.equal(SignupStore.allows(policy, 'bob@example.com'), true)
    assert.equal(SignupStore.allows(policy, 'Bob@EXAMPLE.com'), true)
    assert.equal(SignupStore.allows(policy, 'bob@mail.example.com'), false, 'a subdomain is somebody else')
    assert.equal(SignupStore.allows(policy, 'bob@notexample.com'), false, 'a suffix match is a bypass')
    assert.equal(SignupStore.allows(policy, 'bob@example.com.evil.org'), false)
    assert.equal(SignupStore.allows(policy, 'example.com'), false, 'no @, no email')
})

test('isFull salta justo en el tope', async () => {
    const { secrets } = memorySecrets()
    for (let i = 0; i < SIGNUP_PENDING_CAP - 1; i++) await SignupStore.save(secrets, request({ id: `u${i}@example.com` }))
    assert.equal(await SignupStore.isFull(secrets, 'google'), false)
    await SignupStore.save(secrets, request({ id: 'last@example.com' }))
    assert.equal(await SignupStore.isFull(secrets, 'google'), true)
})
