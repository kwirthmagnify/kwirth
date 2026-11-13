import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash, randomUUID } from 'crypto'

/*
    K1: deleting an access key cuts, at once, the live connections that were started with it.

    Before, the key of a WebSocket instance was checked only when the instance started: deleting it later
    left whoever was connected going on as if nothing had happened. Now DELETE /key/:key tells each of
    its instances (an error SIGNAL), removes it from its channel, and closes the socket with 1008 when
    nothing of another key is left on it.

    Two permanent test keys, each on its own socket, each with a running instance of the 'status' channel
    (cluster view: no pod needed). Deleting one must cut its socket and ONLY its socket: the other one
    keeps answering its PING.

    NON-destructive: both keys carry the 'e2e-k1' description and are deleted at the end, even on failure.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''
const CHANNEL = 'status'
const ANSWER = 15_000

interface IAccessKey { id: string, type: string, resources: string }
interface IWsMessage { action?: string, flow?: string, type?: string, level?: string, channel?: string, instance?: string, text?: string }
interface IWsClose { code: number, reason: string }

const serialize = (k: IAccessKey) => `${k.id}|${k.type}|${k.resources}`

// A WebSocket to the core that keeps everything it receives and how it ended
class CoreSocket {
    ws: WebSocket
    messages: IWsMessage[] = []
    closed?: IWsClose

    constructor(url: string) {
        this.ws = new WebSocket(url)
        this.ws.onmessage = (event: MessageEvent) => {
            try { this.messages.push(JSON.parse(String(event.data)) as IWsMessage) } catch { /* not ours */ }
        }
        this.ws.onclose = (event: CloseEvent) => { this.closed = { code: event.code, reason: event.reason } }
    }

    async open(): Promise<void> {
        if (this.ws.readyState === WebSocket.OPEN) return
        await new Promise<void>((resolve, reject) => {
            this.ws.addEventListener('open', () => resolve(), { once: true })
            this.ws.addEventListener('error', () => reject(new Error('WebSocket could not open')), { once: true })
        })
    }

    send(message: object): void { this.ws.send(JSON.stringify(message)) }

    async waitFor(predicate: (m: IWsMessage) => boolean, what: string): Promise<IWsMessage> {
        await expect.poll(() => this.messages.some(predicate), { message: what, timeout: ANSWER }).toBe(true)
        return this.messages.find(predicate)!
    }

    // START an instance of CHANNEL with 'key' and return its id
    async start(key: IAccessKey): Promise<string> {
        this.send({ action: 'start', flow: 'request', type: 'data', channel: CHANNEL, instance: '', objects: 'pods', accessKey: serialize(key), scope: '', view: 'cluster', namespace: '', group: '', pod: '', container: '' })
        const accepted = await this.waitFor(m => m.action === 'start' && m.flow === 'response' && !!m.instance, `START of ${CHANNEL} accepted`)
        return accepted.instance!
    }

    close(): void { try { this.ws.close() } catch { /* already closed */ } }
}

test.describe.configure({ mode: 'serial' })

test.describe('K1: deleting an access key cuts its live connections', () => {
    let api: APIRequestContext
    let auth: Record<string, string>
    const created: string[] = []
    const sockets: CoreSocket[] = []

    const createKey = async (): Promise<IAccessKey> => {
        const accessKey: IAccessKey = { id: randomUUID(), type: 'permanent', resources: 'cluster::::' }
        const response = await api.post('/key', { headers: auth, data: { accessKey, description: 'e2e-k1', expire: Date.now() + 3_600_000, days: 1 } })
        expect(response.status(), 'create a permanent test key').toBe(200)
        created.push(accessKey.id)
        return accessKey
    }

    const openSocket = async (): Promise<CoreSocket> => {
        const socket = new CoreSocket(BACK.replace(/^http/, 'ws'))
        sockets.push(socket)
        await socket.open()
        return socket
    }

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const login = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(login.status(), 'login against the back end').toBe(200)
        const key = (await login.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${serialize(key)}` }
    })

    test.afterAll(async () => {
        for (const socket of sockets) socket.close()
        for (const id of created) await api.delete(`/key/${id}`, { headers: auth }).catch(() => {})
        await api.dispose()
    })

    test('the deleted key\'s socket is told and closed with 1008; another key\'s socket goes on', async () => {
        const info = await (await api.get('/config/info')).json() as { channels: { id: string }[] }
        test.skip(!info.channels.some(c => c.id === CHANNEL), `the '${CHANNEL}' channel is not loaded in this core`)

        const revoked = await createKey()
        const kept = await createKey()
        const revokedSocket = await openSocket()
        const keptSocket = await openSocket()
        const revokedInstance = await revokedSocket.start(revoked)
        const keptInstance = await keptSocket.start(kept)

        const deleted = await api.delete(`/key/${revoked.id}`, { headers: auth })
        expect(deleted.status(), 'delete the key').toBe(200)

        // told: an error signal for the instance started with it
        const signal = await revokedSocket.waitFor(m => m.type === 'signal' && m.level === 'error' && m.instance === revokedInstance, 'the revoked instance is told')
        expect(signal.text).toContain('Access key revoked')
        // and cut: nothing else was on that socket, so it is closed as a policy violation
        await expect.poll(() => revokedSocket.closed?.code, { message: 'the revoked socket is closed', timeout: ANSWER }).toBe(1008)

        // the other key: its socket is open, nothing was said to it, and its instance still answers
        expect(keptSocket.closed, 'the other key\'s socket stays open').toBeUndefined()
        expect(keptSocket.messages.some(m => m.type === 'signal' && m.level === 'error' && m.instance === keptInstance)).toBe(false)
        keptSocket.send({ action: 'ping', flow: 'request', type: 'data', channel: CHANNEL, instance: keptInstance, accessKey: serialize(kept) })
        const pong = await keptSocket.waitFor(m => m.action === 'ping' && m.flow === 'response', 'the other key\'s instance answers its PING')
        expect(pong.text).toBe('OK')
    })

    test('a deleted key can no longer RECONNECT to the instance it started', async () => {
        const info = await (await api.get('/config/info')).json() as { channels: { id: string }[] }
        test.skip(!info.channels.some(c => c.id === CHANNEL), `the '${CHANNEL}' channel is not loaded in this core`)

        const key = await createKey()
        const first = await openSocket()
        const instance = await first.start(key)
        expect((await api.delete(`/key/${key.id}`, { headers: auth })).status()).toBe(200)
        await expect.poll(() => first.closed?.code, { message: 'the socket is closed', timeout: ANSWER }).toBe(1008)

        const second = await openSocket()
        second.send({ action: 'reconnect', flow: 'request', type: 'data', channel: CHANNEL, instance, accessKey: serialize(key) })
        const refused = await second.waitFor(m => m.type === 'signal' && m.level === 'error', 'the RECONNECT is refused')
        expect(refused.text).toContain('Invalid or missing access key')
    })
})
