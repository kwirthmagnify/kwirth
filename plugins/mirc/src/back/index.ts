import {
    IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType,
    BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction,
    EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IChannel
} from '@kwirthmagnify/kwirth-common-back'
import {
    IMircMessageRecord, IMircUser, IMircSend, IMircRead, IMircHello,
    TMircAny
} from '../common/MircTypes'

// One logical user connection. A user (nick) can have several instances/sockets
// (several tabs / clusters), so presence is "online if at least one is alive".
interface IInstance {
    instanceId: string
    accessKey: AccessKey
    nick: string
}

// A pending receipt that could not be pushed because the sender was offline.
// Persisted under the SENDER's outbox so it can be replayed when they return.
interface IPendingReceipt {
    msgId: string
    to: string
    state: 'delivered' | 'read'
    ts: string
}

const nowUtc = (): string => new Date().toISOString()   // server clock, UTC, authoritative

class MircChannel implements IChannel {
    readonly channelId = 'mirc'
    // storage:true -> we get writeStorage/readStorage (ConfigMap/Secret backed) for the mailbox
    readonly requirements = { storage: true, providers: [] as string[] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket; lastRefresh: number; instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'mirc',
        routable: false,
        pauseable: false,
        modifiable: false,
        reconnectable: false,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [],          // front-hub model: no back-to-back endpoints needed
        websocket: false,
        cluster: true,          // cluster-scoped channel (not tied to pods)
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async () => {}
    processProviderEvent(_providerId: string, _obj: unknown): void {}
    endpointRequest(_endpoint: string, _req: any, _res: any, _accessKey?: AccessKey): void {}
    async websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): Promise<void> {}

    // ---- known nicks (persisted so offline users still appear in the roster) ---
    private knownNicks: Set<string> = new Set()
    private knownNicksLoaded = false

    private async ensureKnownNicksLoaded(): Promise<void> {
        if (this.knownNicksLoaded) return
        const arr = await this.readJson<string[]>('mirc.known-nicks', [])
        for (const n of arr) this.knownNicks.add(n)
        this.knownNicksLoaded = true
    }

    private async registerKnownNick(nick: string): Promise<void> {
        await this.ensureKnownNicksLoaded()
        if (this.knownNicks.has(nick)) return
        this.knownNicks.add(nick)
        await this.writeJson('mirc.known-nicks', [...this.knownNicks])
    }

    // ---- storage helpers (mailbox + outbox), keyed by nick --------------------
    // ConfigMap names must be RFC 1123 subdomains: replace _ with -
    private safeKey = (nick: string) => nick.replace(/_/g, '-')
    private mailboxKey = (nick: string) => `mirc.mailbox.${this.safeKey(nick)}`
    private outboxKey = (nick: string) => `mirc.outbox.${this.safeKey(nick)}`

    private async readJson<T>(key: string, fallback: T): Promise<T> {
        try {
            const raw = await this.backChannelObject.readStorage?.(key, false)
            if (raw === undefined || raw === null || raw === '') return fallback
            return typeof raw === 'string' ? JSON.parse(raw) as T : raw as T
        } catch { return fallback }
    }
    private async writeJson(key: string, data: unknown): Promise<void> {
        try { await this.backChannelObject.writeStorage?.(key, false, JSON.stringify(data)) }
        catch (e) { this.backChannelObject.logError?.(`mirc: cannot persist ${key}: ${e}`) }
    }

    // ---- presence helpers -----------------------------------------------------
    private socketsForNick(nick: string): WebSocket[] {
        return this.webSockets.filter(s => s.instances.some(i => i.nick === nick)).map(s => s.ws)
    }
    private isOnline(nick: string): boolean { return this.socketsForNick(nick).length > 0 }
    private allNicks(): string[] {
        const set = new Set<string>()
        for (const s of this.webSockets) for (const i of s.instances) set.add(i.nick)
        return [...set]
    }

    private send(ws: WebSocket, msg: TMircAny): void {
        try { ws.send(JSON.stringify(msg)) } catch (e) { this.backChannelObject.logError?.(`mirc send failed: ${e}`) }
    }
    private envelope(instance: string) {
        return { channel: 'mirc', instance, type: EInstanceMessageType.DATA, flow: EInstanceMessageFlow.UNSOLICITED, action: EInstanceMessageAction.NONE }
    }

    private sendRoster(ws: WebSocket, instance: string): void {
        const users: IMircUser[] = [...this.knownNicks].map(nick => ({ nick, online: this.isOnline(nick) }))
        this.send(ws, { ...this.envelope(instance), msgtype: 'mirc-roster-data', users })
    }
    private broadcastPresence(nick: string, online: boolean): void {
        for (const s of this.webSockets) {
            const inst = s.instances[0]?.instanceId ?? ''
            this.send(s.ws, { ...this.envelope(inst), msgtype: 'mirc-presence', nick, online })
        }
    }

    // ---- registration: cluster channels arrive here via addObject('*all') ----
    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        // Purge stale sockets (no refresh in 60 s — covers crashed/HMR-orphaned connections)
        const threshold = Date.now() - 60000
        const stale = this.webSockets.filter(s => s.ws !== webSocket && s.lastRefresh < threshold)
        for (const s of stale) {
            const nicks = [...new Set(s.instances.map(i => i.nick))]
            this.webSockets = this.webSockets.filter(x => x !== s)
            try { s.ws.close() } catch {}
            for (const n of nicks) if (!this.isOnline(n)) this.broadcastPresence(n, false)
        }

        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) { const n = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] }); socket = this.webSockets[n - 1] }
        const nick: string = instanceConfig.data?.nick || accessKeyDeserialize(instanceConfig.accessKey).id || 'anon'
        await this.registerKnownNick(nick)
        const wasOnline = this.isOnline(nick)
        if (!socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            socket.instances.push({ instanceId: instanceConfig.instance, accessKey: accessKeyDeserialize(instanceConfig.accessKey), nick })
        }
        if (!wasOnline) this.broadcastPresence(nick, true)
        this.sendRoster(webSocket, instanceConfig.instance)
        await this.flushMailbox(nick)
        await this.replayOutbox(nick)
        return true
    }

    // ---- commands from the front (action COMMAND) ----------------------------
    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        const msg = instanceMessage as TMircAny
        switch ((msg as any).msgtype) {
            case 'mirc-hello':   return this.onHello(webSocket, msg as IMircHello)
            case 'mirc-send':    return this.onSend(webSocket, msg as IMircSend)
            case 'mirc-read':    return this.onRead(msg as IMircRead)
            case 'mirc-roster':  this.sendRoster(webSocket, instanceMessage.instance); return true
            default:             return true
        }
    }

    private async onHello(webSocket: WebSocket, msg: IMircHello): Promise<boolean> {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const inst = socket.instances.find(i => i.instanceId === msg.instance)
            if (inst && msg.nick) inst.nick = msg.nick
        }
        this.sendRoster(webSocket, msg.instance)
        if (msg.nick) { await this.flushMailbox(msg.nick); await this.replayOutbox(msg.nick) }
        return true
    }

    private async onSend(webSocket: WebSocket, msg: IMircSend): Promise<boolean> {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const from = socket?.instances.find(i => i.instanceId === msg.instance)?.nick
            ?? socket?.instances[0]?.nick ?? 'anon'
        const ts = nowUtc()                              // server stamps the authoritative UTC ts
        const record: IMircMessageRecord = { msgId: msg.msgId, from, to: msg.to, ts, body: msg.body, state: 'sent' }

        // single check: accepted + about to be stored/relayed
        this.send(webSocket, { ...this.envelope(msg.instance), msgtype: 'mirc-ack', msgId: msg.msgId, ts, state: 'sent' })

        const targets = this.socketsForNick(msg.to)
        if (targets.length > 0) {
            // recipient online -> deliver live to every connection they hold
            for (const tws of targets) this.send(tws, { ...this.envelope(''), msgtype: 'mirc-message', record: { ...record, state: 'delivered' } })
            // double check (optimistic: delivered once pushed to an online socket)
            this.send(webSocket, { ...this.envelope(msg.instance), msgtype: 'mirc-receipt', msgId: msg.msgId, to: msg.to, state: 'delivered', ts })
        } else {
            // recipient offline -> park in their mailbox until they connect
            const box = await this.readJson<IMircMessageRecord[]>(this.mailboxKey(msg.to), [])
            if (!box.some(r => r.msgId === msg.msgId)) { box.push(record); await this.writeJson(this.mailboxKey(msg.to), box) }
        }
        return true
    }

    private async onRead(msg: IMircRead): Promise<boolean> {
        // notify the sender (peer) that their messages were read
        const ts = nowUtc()
        const senderSockets = this.socketsForNick(msg.peer)
        for (const msgId of msg.msgIds) {
            if (senderSockets.length > 0) {
                for (const sws of senderSockets) this.send(sws, { ...this.envelope(''), msgtype: 'mirc-receipt', msgId, to: msg.peer, state: 'read', ts })
            } else {
                const out = await this.readJson<IPendingReceipt[]>(this.outboxKey(msg.peer), [])
                out.push({ msgId, to: msg.peer, state: 'read', ts }); await this.writeJson(this.outboxKey(msg.peer), out)
            }
        }
        return true
    }

    // deliver parked messages to a user that just connected, then ack delivery
    private async flushMailbox(nick: string): Promise<void> {
        const box = await this.readJson<IMircMessageRecord[]>(this.mailboxKey(nick), [])
        if (box.length === 0) return
        const ackTs = nowUtc()
        for (const record of box) {
            for (const tws of this.socketsForNick(nick)) this.send(tws, { ...this.envelope(''), msgtype: 'mirc-message', record: { ...record, state: 'delivered' } })
            // tell the original sender it was delivered (or park the receipt if they're away)
            const senderSockets = this.socketsForNick(record.from)
            if (senderSockets.length > 0) {
                for (const sws of senderSockets) this.send(sws, { ...this.envelope(''), msgtype: 'mirc-receipt', msgId: record.msgId, to: nick, state: 'delivered', ts: ackTs })
            } else {
                const out = await this.readJson<IPendingReceipt[]>(this.outboxKey(record.from), [])
                out.push({ msgId: record.msgId, to: nick, state: 'delivered', ts: ackTs }); await this.writeJson(this.outboxKey(record.from), out)
            }
        }
        await this.writeJson(this.mailboxKey(nick), [])   // delivered -> clear the queue
    }

    // replay receipts that arrived while this sender was offline
    private async replayOutbox(nick: string): Promise<void> {
        const out = await this.readJson<IPendingReceipt[]>(this.outboxKey(nick), [])
        if (out.length === 0) return
        for (const r of out) for (const sws of this.socketsForNick(nick))
            this.send(sws, { ...this.envelope(''), msgtype: 'mirc-receipt', msgId: r.msgId, to: r.to, state: r.state, ts: r.ts })
        await this.writeJson(this.outboxKey(nick), [])
    }

    // ---- lifecycle / bookkeeping ---------------------------------------------
    containsAsset = (): boolean => false
    containsInstance = (instanceId: string): boolean => this.webSockets.some(s => s.instances.some(i => i.instanceId === instanceId))
    deleteObject = async (): Promise<boolean> => true
    pauseContinueInstance = (): void => {}
    modifyInstance = (): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => { this.removeInstance(webSocket, instanceConfig.instance) }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const inst = socket.instances.find(i => i.instanceId === instanceId)
        socket.instances = socket.instances.filter(i => i.instanceId !== instanceId)
        if (inst && !this.isOnline(inst.nick)) this.broadcastPresence(inst.nick, false)
    }

    containsConnection = (webSocket: WebSocket): boolean => this.webSockets.some(s => s.ws === webSocket)

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const nicks = [...new Set(socket.instances.map(i => i.nick))]
        this.webSockets = this.webSockets.filter(s => s.ws !== webSocket)
        for (const nick of nicks) if (!this.isOnline(nick)) this.broadcastPresence(nick, false)
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        const entry = this.webSockets.find(s => s.instances.some(i => i.instanceId === instanceId))
        if (entry) { entry.ws = newWebSocket; return true }
        return false
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const resp: ISignalMessage = { action, flow, channel: 'mirc', instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level }
        try { ws.send(JSON.stringify(resp)) } catch {}
    }
}

export default MircChannel
