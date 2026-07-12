import { IMircMessageRecord, IMircUser, TMircState } from '../common/MircTypes'
import type { IChannelObject } from '@kwirthmagnify/kwirth-common-front'

// ============================================================================
// MircClient — the front engine (single- and multi-cluster).
//
// The user's OWN cluster (the tab's cluster) uses the framework tab socket
// (channelObject.webSocket): the core opens it, keeps it alive and reconnects
// it. OTHER clusters (multi-cluster reach) are served by extra sockets MircClient
// opens itself. Presence, messages, receipts and the double-check flow over
// these sockets. Conversation history is cached locally (localStorage); the
// back's mailbox handles offline delivery (recovered on connect).
// ============================================================================

export interface IClusterEntry { id: string; name: string; url: string; accessString: string; enabled?: boolean }

// A message as the UI sees it. `pending` marks an optimistic local echo not yet
// acked by the server (clock icon); once acked, `state` drives the checks.
export interface IUiMessage extends IMircMessageRecord { cluster: string; mine: boolean; pending?: boolean }

// owned=false → the local cluster served by the framework tab socket (do not open/close it here).
interface IConn { entry: IClusterEntry; ws?: WebSocket; instance: string; open: boolean; owned: boolean }

type Listener = () => void

const genId = (): string =>
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const histKey = (cluster: string, peer: string) => `kwirth.mirc.history.${cluster}.${peer}`

export class MircClient {
    nick: string
    private channelObject?: IChannelObject             // framework socket (local cluster) lives here
    private localClusterId?: string                    // the cluster served by the framework tab socket
    private conns: Map<string, IConn> = new Map()      // by cluster id
    private rosterByCluster: Map<string, IMircUser[]> = new Map()
    private history: Map<string, IUiMessage[]> = new Map()  // key = `${cluster}::${peer}`
    private listeners: Listener[] = []

    constructor(nick: string, channelObject?: IChannelObject) { this.nick = nick; this.channelObject = channelObject }

    onChange(fn: Listener) { this.listeners.push(fn) }
    private emit() { for (const l of this.listeners) l() }

    // ---- lifecycle ----------------------------------------------------------
    // localClusterId: the tab's cluster → served by the framework socket (no own ws). The rest open their own.
    start(clusters: IClusterEntry[], localClusterId?: string) {
        this.localClusterId = localClusterId
        for (const e of clusters) {
            if (e.id === localClusterId) {
                // Own cluster: reuse the framework tab socket (core keepalive + reconnect). START already sent by core.
                this.conns.set(e.id, { entry: e, ws: undefined, instance: '', open: true, owned: false })
            }
            else {
                if (!e.url || !e.accessString) continue
                this.openCluster(e)   // remote cluster: mirc opens its own socket
            }
        }
        this.emit()
    }

    stop() {
        for (const c of this.conns.values()) { if (c.owned) { try { c.ws?.close() } catch {} } }   // never close the framework socket
        this.conns.clear()
        this.rosterByCluster.clear()
        this.emit()
    }

    // Live socket for a conn: the framework socket for the local cluster (re-read each time so reconnects are
    // picked up), the own ws for remote clusters.
    private wsOf(conn: IConn): WebSocket | undefined {
        return conn.owned ? conn.ws : this.channelObject?.webSocket
    }

    // Inbound frame from the framework socket (local cluster), fed by MircChannel.processChannelMessage.
    handleFrameworkMessage(ev: MessageEvent): void {
        if (this.localClusterId) this.onMessage(this.localClusterId, ev)
    }

    // Framework socket dropped / reconnected (local cluster). The back keeps our instance (reconnectable).
    markLocalDisconnected(): void { const c = this.localClusterId && this.conns.get(this.localClusterId); if (c) c.open = false; this.emit() }
    resyncLocal(): void { const c = this.localClusterId && this.conns.get(this.localClusterId); if (c) c.open = true; this.emit() }

    private openCluster(entry: IClusterEntry) {
        const conn: IConn = { entry, instance: '', open: false, owned: true }
        this.conns.set(entry.id, conn)
        try {
            const ws = new WebSocket(entry.url)
            conn.ws = ws
            ws.onopen = () => {
                conn.open = true
                // START handshake for a cluster-scoped channel (mirrors the core front)
                ws.send(JSON.stringify({
                    channel: 'mirc', objects: 'pods', action: 'start', flow: 'request',
                    instance: '', accessKey: entry.accessString, scope: 'cluster', view: 'cluster',
                    namespace: '', group: '', pod: '', container: '', type: 'signal',
                    data: { nick: this.nick }
                }))
                this.emit()
            }
            ws.onmessage = (ev) => this.onMessage(entry.id, ev)
            ws.onclose = () => { conn.open = false; this.emit() }
            ws.onerror = () => { conn.open = false; this.emit() }
        } catch { /* unreachable cluster — leave it offline */ }
    }

    private onMessage(clusterId: string, ev: MessageEvent) {
        let msg: any
        try { msg = JSON.parse(ev.data) } catch { return }
        const conn = this.conns.get(clusterId)

        // START / RESPONSE carries our assigned instanceId
        if (msg.type === 'signal' && msg.action === 'start' && msg.flow === 'response') {
            if (conn) { conn.instance = msg.instance; conn.open = true }
            // Local cluster: mirror the instance to channelObject so the core keepalive/reconnect track it.
            if (clusterId === this.localClusterId && this.channelObject) this.channelObject.instanceId = msg.instance
            this.emit(); return
        }

        switch (msg.msgtype) {
            case 'mirc-roster-data': this.rosterByCluster.set(clusterId, msg.users as IMircUser[]); this.emit(); break
            case 'mirc-presence': {
                const list = this.rosterByCluster.get(clusterId) ?? []
                const u = list.find(x => x.nick === msg.nick)
                if (u) u.online = msg.online
                else list.push({ nick: msg.nick, online: msg.online })
                this.rosterByCluster.set(clusterId, list); this.emit(); break
            }
            case 'mirc-message': {
                const r: IMircMessageRecord = msg.record
                const peer = r.from === this.nick ? r.to : r.from
                this.appendHistory(clusterId, peer, { ...r, cluster: clusterId, mine: r.from === this.nick })
                this.emit(); break
            }
            case 'mirc-ack': {
                this.updateState(clusterId, msg.msgId, msg.state as TMircState, msg.ts, /*clearPending*/ true)
                this.emit(); break
            }
            case 'mirc-receipt': {
                this.updateState(clusterId, msg.msgId, msg.state as TMircState)
                this.emit(); break
            }
        }
    }

    // ---- sending ------------------------------------------------------------
    send(clusterId: string, to: string, body: string) {
        const conn = this.conns.get(clusterId)
        if (!conn || !conn.open) return
        const ws = this.wsOf(conn)
        if (!ws) return
        const msgId = genId()
        const ts = new Date().toISOString()   // optimistic local ts, replaced by server ts on ack
        // optimistic echo so the message shows immediately with a clock
        this.appendHistory(clusterId, to, { msgId, from: this.nick, to, ts, body, state: 'sent', cluster: clusterId, mine: true, pending: true })
        ws.send(JSON.stringify({
            channel: 'mirc', instance: conn.instance, action: 'command', flow: 'request', type: 'data',
            accessKey: conn.entry.accessString, msgtype: 'mirc-send', msgId, to, body
        }))
        this.emit()
    }

    markRead(clusterId: string, peer: string) {
        const conn = this.conns.get(clusterId)
        if (!conn || !conn.open) return
        const ws = this.wsOf(conn)
        if (!ws) return
        const key = `${clusterId}::${peer}`
        const msgs = this.history.get(key) ?? this.loadHistory(clusterId, peer)
        const unread = msgs.filter(m => !m.mine && m.state !== 'read').map(m => m.msgId)
        if (unread.length === 0) return
        ws.send(JSON.stringify({
            channel: 'mirc', instance: conn.instance, action: 'command', flow: 'request', type: 'data',
            accessKey: conn.entry.accessString, msgtype: 'mirc-read', peer, msgIds: unread
        }))
    }

    // ---- history (dedup by msgId, ordered by server ts) ---------------------
    private appendHistory(cluster: string, peer: string, m: IUiMessage) {
        const key = `${cluster}::${peer}`
        const list = this.history.get(key) ?? this.loadHistory(cluster, peer)
        const existing = list.find(x => x.msgId === m.msgId)
        if (existing) { Object.assign(existing, m, { pending: false }) }
        else list.push(m)
        list.sort((a, b) => a.ts.localeCompare(b.ts))
        this.history.set(key, list)
        this.saveHistory(cluster, peer, list)
    }

    private updateState(cluster: string, msgId: string, state: TMircState, ts?: string, clearPending = false) {
        for (const [key, list] of this.history) {
            if (!key.startsWith(cluster + '::')) continue
            const m = list.find(x => x.msgId === msgId)
            if (m) {
                if (this.stateRank(state) >= this.stateRank(m.state)) m.state = state
                if (ts) m.ts = ts
                if (clearPending) m.pending = false
                list.sort((a, b) => a.ts.localeCompare(b.ts))
                this.saveHistory(cluster, key.split('::')[1], list)
                return
            }
        }
    }
    private stateRank(s: TMircState): number { return ['failed', 'sent', 'delivered', 'read'].indexOf(s) }

    private loadHistory(cluster: string, peer: string): IUiMessage[] {
        try { const raw = localStorage.getItem(histKey(cluster, peer)); if (raw) return JSON.parse(raw) } catch {}
        return []
    }
    private saveHistory(cluster: string, peer: string, list: IUiMessage[]) {
        try { localStorage.setItem(histKey(cluster, peer), JSON.stringify(list.slice(-500))) } catch {}
    }

    // ---- views for the UI ---------------------------------------------------
    getRoster(): IMircUser[] {
        const out: IMircUser[] = []
        for (const [clusterId, users] of this.rosterByCluster) {
            const name = this.conns.get(clusterId)?.entry.name ?? clusterId
            for (const u of users) if (u.nick !== this.nick) out.push({ ...u, cluster: name })
        }
        return out.sort((a, b) => Number(b.online) - Number(a.online) || a.nick.localeCompare(b.nick))
    }
    getConversation(cluster: string, peer: string): IUiMessage[] {
        const key = `${cluster}::${peer}`
        if (!this.history.has(key)) this.history.set(key, this.loadHistory(cluster, peer))
        return this.history.get(key) ?? []
    }
    clusterIdByName(name: string): string | undefined {
        for (const c of this.conns.values()) if (c.entry.name === name) return c.entry.id
        return undefined
    }

    clearConversation(cluster: string, peer: string) {
        const key = `${cluster}::${peer}`
        this.history.set(key, [])
        try { localStorage.removeItem(histKey(cluster, peer)) } catch {}
        this.emit()
    }
}
