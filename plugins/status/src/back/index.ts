import { IInstanceConfig, ISignalMessage, AccessKey, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel } from '@kwirthmagnify/kwirth-common-back'
import { ERouteOwnerKind, IChannelInstances, IDceAccess, IDceMeta, IPluginAccess, IPluginStatus, IPublishedRoute, IRouteAccess } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusPayload, IStatusComponent, IStatusDce, IStatusDceConsumer, IStatusEdge, IStatusInventory, IStatusMessageResponse, IStatusSqlInfo, IStatusSqlPool } from '../common/StatusTypes'
import { ProcessProbe } from './ProcessProbe'

/*
    Kwirth Status — the inventory of what Kwirth has mounted (S1).

    The channel does NOT collect: it queries. There is no timer, no subscription to anything, and no state
    to keep between requests. When somebody opens the tab, ClusterInfo — which is already in memory — is
    read and a snapshot is sent. With the tab closed, this plugin does not execute a single instruction,
    which is the requirement that rules over everything else (the PRD's RNF1).
*/

/**
 * What this channel needs from ClusterInfo, and nothing else.
 *
 * It is declared here instead of using 'any' because this is all the plugin does: read these four
 * registries. The real type lives in the core and is not published to extensions, so the honest
 * alternative to a minimal view would be an 'any' that says nothing and warns about nothing.
 */
interface IProviderLike {
    id: string
    started?: boolean
    configRouterStarted?: boolean
    providesRouter?: boolean
    configRouter?: unknown
    /**
     * OPTIONAL in the contract (kwirth-common-back >= 0.5.50) and genuinely optional: most published
     * providers do not have it. Whoever does not implement it shows up as "not reported".
     */
    getStats?(): { subscribers: number, events?: number }
    /**
     * Only on the core's internal 'corelog' provider: returns the last N lines from the in-memory ring
     * buffer. Absent on every other provider and on older cores that do not have it.
     */
    getLogLines?(count?: number): string[]
}

interface IListing {
    id: string
    configNames: string[]
}

/**
 * An edge as the core returns it (ClusterInfo.getSubscriptions). The consumer field was renamed from
 * 'channelId' to 'consumerId' when a provider became able to subscribe to another provider: both are
 * optional so this plugin reads either core.
 */
interface ISubscriptionLike {
    providerId: string
    consumerId?: string
    channelId?: string
    since: number
}

/**
 * The core's subscriptions as edges of this plugin. An entry without a consumer is dropped rather than
 * drawn as a line to nowhere: that is what happened when the core renamed the field and this plugin
 * kept reading the old one.
 */
export const toStatusEdges = (subscriptions: ISubscriptionLike[]): IStatusEdge[] => {
    const edges: IStatusEdge[] = []
    for (const s of subscriptions) {
        const consumerId = s.consumerId ?? s.channelId
        if (consumerId) edges.push({ providerId: s.providerId, consumerId, since: s.since })
    }
    return edges
}

interface IClusterInfoView {
    name?: string
    providers?: IProviderLike[]
    pluviders?: Map<string, unknown>
    senders?: { listSenders(): IListing[] }
    webhooks?: { listWebhooks(): IListing[] }
    /**
     * OPTIONAL because a core older than this stream does not have it: without it the inventory still
     * comes out and the only thing missing is the graph. Better without a diagram than with a broken screen.
     */
    getSubscriptions?(): ISubscriptionLike[]
    /** The core's route registry. Optional for the same reason: an older core has none. */
    routes?: IRouteAccess
    /** The core's DCE manager. Optional for the same reason. */
    dces?: IDceAccess
    /** The core's installed plugins. Optional for the same reason. */
    plugins?: IPluginAccess
}

const ROUTE_OWNERS: ReadonlySet<string> = new Set(Object.values(ERouteOwnerKind))

/*
    The published routes, or undefined when the core does not expose them — which is "unknown", and the
    tab says so, never "this Kwirth has no routes". An owner kind this plugin does not know yet (a newer
    core) is shown as OTHER rather than dropped.
*/
export const toStatusRoutes = (access: IRouteAccess | undefined): IPublishedRoute[] | undefined => {
    if (!access) return undefined
    try {
        return access.listRoutes().map(r => ({ ...r, ownerKind: ROUTE_OWNERS.has(r.ownerKind) ? r.ownerKind : ERouteOwnerKind.OTHER }))
    }
    catch (err) {
        // Said in the core's log: swallowing it left the tab claiming the core had no route list, with
        // nothing anywhere to say why.
        console.error(`[status] the core's route list failed: ${err}`)
        return undefined
    }
}

/*
    The installed DCEs, or undefined when the core does not expose them — "unknown", like the routes.
    Only the state and the error of the back end are taken from the registry entry: the instance is the
    DCE's live object, and it has no business in a message to the browser.

    A consumer lookup that fails leaves THAT DCE with no consumers and says so in the log; the rest of
    the list still comes out.
*/
export const toStatusDces = async (access: IDceAccess | undefined): Promise<IStatusDce[] | undefined> => {
    if (!access) return undefined
    let metas: IDceMeta[]
    try {
        metas = await access.listInstalled()
    }
    catch (err) {
        console.error(`[status] the core's DCE list failed: ${err}`)
        return undefined
    }
    return Promise.all(metas.map(async (m): Promise<IStatusDce> => {
        const entry = access.status(m.id)
        let consumers: IStatusDceConsumer[] = []
        try {
            consumers = (await access.consumers(m.id)).map(c => ({ type: c.type, id: c.id }))
        }
        catch (err) {
            console.error(`[status] the consumers of DCE '${m.id}' could not be resolved: ${err}`)
        }
        return {
            id: m.id,
            name: m.displayName || m.name || m.id,
            version: m.version,
            ...(m.installedFrom ? { source: m.installedFrom } : {}),
            hasBack: m.hasBack,
            hasFront: m.hasFront,
            ...(entry ? { back: { state: entry.state, ...(entry.error ? { error: entry.error } : {}) } } : {}),
            consumers
        }
    }))
}

/*
    The installed plugins, or undefined when the core does not expose them — "unknown", like the routes
    and the DCEs. The core already guards each plugin's own figures; what is guarded here is the listing
    as a whole, so a core that fails at it leaves the rest of the snapshot intact.
*/
export const toStatusPlugins = async (access: IPluginAccess | undefined): Promise<IPluginStatus[] | undefined> => {
    if (!access) return undefined
    try {
        return await access.listPlugins()
    }
    catch (err) {
        console.error(`[status] the core's plugin list failed: ${err}`)
        return undefined
    }
}

/**
 * What a provider says about itself, or undefined when it does not say or blows up on being asked.
 *
 * It is third-party code: if it throws, this screen must still deliver the rest of the inventory. And if
 * it returns something that does not match the contract, it is discarded rather than believed —
 * TypeScript does not police an already compiled provider.
 */
const statsOf = (p: { getStats?(): { subscribers: number, events?: number } }): { subscribers?: number, events?: number } | undefined => {
    if (!p.getStats) return undefined
    try {
        const s = p.getStats()
        return {
            subscribers: typeof s?.subscribers === 'number' ? s.subscribers : undefined,
            events: typeof s?.events === 'number' ? s.events : undefined
        }
    }
    catch {
        return undefined
    }
}

interface ISocketEntry {
    ws: WebSocket
    lastRefresh: number
    instanceIds: string[]
}

class StatusChannel implements IChannel {
    readonly channelId = 'status'
    /*
        No providers and no storage. Declaring a provider here would START it as a side effect of having a
        status viewer installed — the core instantiates whatever some channel declares — and then this
        screen would be modifying precisely what it claims to observe.
    */
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: IClusterInfoView
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []
    // Exposed for the harness: whether the event-loop sampler is running is part of the contract.
    readonly probe = new ProcessProbe()

    constructor(clusterInfo: IClusterInfoView, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'status',
        routable: false,
        pauseable: false,       // no hay flujo que pausar: es una foto bajo demanda
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: true,          // lo que se mira es el Kwirth entero, no un pod
        resourced: false
    })

    /*
        Seeing the complete inventory is a privileged view: it shows every mounted extension and its
        state. That is why the minimum level is 'cluster' and there is no per-namespace rung — an
        inventory "of a namespace" would make no sense, and leaving it at 'none' would open it to anyone.
    */
    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster', 'admin'].indexOf(scope)

    startChannel = async () => {}

    processProviderEvent(_providerId: string, _obj: unknown): void {}

    endpointRequest(_endpoint: string, _req: unknown, _res: unknown, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            socket = { ws: webSocket, lastRefresh: Date.now(), instanceIds: [] }
            this.webSockets.push(socket)
        }
        if (!socket.instanceIds.includes(instanceConfig.instance)) socket.instanceIds.push(instanceConfig.instance)
        this.watchProcess()
        await this.sendInventory(socket, instanceConfig.instance)
        return true
    }

    /** The event-loop sampler runs while at least one status tab is open, and only then. */
    private watchProcess = (): void => {
        this.probe.watch(this.webSockets.some(s => s.instanceIds.length > 0))
    }

    /*
        Called by the core on the OLD channel object when it reloads the plugin in dev. Without it the
        sampler of the old object would keep running forever, with nobody to read it.
    */
    cleanup = (): void => {
        this.webSockets = []
        this.probe.watch(false)
    }

    deleteObject = async (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => true

    pauseContinueInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void => {}

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instanceIds.includes(instanceId))

    // A connection counts while it carries an instance: one left with none is on its way out.
    getInstances = (): IChannelInstances => {
        const carrying = this.webSockets.filter(s => s.instanceIds.length > 0)
        return {
            instances: carrying.reduce((n, s) => n + s.instanceIds.length, 0),
            connections: carrying.length
        }
    }

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.removeInstance(webSocket, instanceConfig.instance)
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instanceIds.indexOf(instanceId)
        if (pos >= 0) socket.instanceIds.splice(pos, 1)
        this.watchProcess()
    }

    /*
        Asking for the snapshot again. It is the ONLY way this channel does any work: somebody with the
        screen open presses refresh. There is no automatic refresh on purpose — it would be collection in
        disguise.
    */
    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket || !socket.instanceIds.includes(instanceMessage.instance)) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Status instance not found')
            return false
        }
        await this.sendInventory(socket, instanceMessage.instance)
        return true
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const pos = this.webSockets.findIndex(s => s.ws === webSocket)
        if (pos >= 0) this.webSockets.splice(pos, 1)
        this.watchProcess()
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        socket.lastRefresh = Date.now()
        return true
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.webSockets) {
            if (entry.instanceIds.includes(instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ---- the inventory -------------------------------------------------------

    /*
        A provider's state with what the core knows TODAY.

        "Active" is deliberately NOT told from "idle": for that one has to ask the provider how many
        subscribers it has, and that contract does not exist yet (it arrives in S2). Inventing the fact
        would be worse than not giving it — an administrator who reads "idle" is going to go and
        uninstall something.
    */
    /**
     * How many consumers it has, or undefined when it does not say.
     *
     * It is guarded with try/catch because this is third-party extension code: a provider that blows up
     * on being asked must not take the whole screen down with it. If it fails, it does not report.
     */
    private subscribersOf = (p: IProviderLike): number | undefined => statsOf(p)?.subscribers

    private eventsOf = (p: IProviderLike): number | undefined => statsOf(p)?.events

    private healthOfProvider = (p: IProviderLike, subscribers: number | undefined): { health: EComponentHealth, reason?: string } => {
        if (p.started !== true) {
            /*
                Stopped BUT with subscribers: the silent failure this screen exists to catch.

                The core only starts a provider when some channel declares it in 'requirements.providers'.
                But anybody can subscribe at RUNTIME with clusterInfo.addSubscriber(), and that works even
                though the provider never started: the subscription is registered, the provider emits
                nothing, and the channel sits waiting for data that is not going to arrive. No error, no
                log, nothing.

                Saying "no channel declares it" here would be technically true — in requirements — and
                completely misleading, because there IS somebody consuming.
            */
            if (subscribers !== undefined && subscribers > 0) {
                return {
                    health: EComponentHealth.NOT_INSTANTIATED,
                    reason: `${subscribers} subscriber${subscribers > 1 ? 's' : ''} waiting for data that will never arrive: no channel declares it in its requirements`
                }
            }
            return {
                health: EComponentHealth.NOT_INSTANTIATED,
                // The core only instantiates the providers some channel declares in its requirements.
                reason: 'No installed channel declares this provider, so the core never started it'
            }
        }
        // Running, but with its configuration router unmounted: routers are hooked in ONLY at server
        // startup, so its configuration will answer 404 until it is restarted.
        if (p.configRouter && p.configRouterStarted !== true) {
            return {
                health: EComponentHealth.PENDING_RESTART,
                reason: 'Its configuration endpoint is not mounted — the server has not been restarted since it was installed'
            }
        }
        /*
            With S2's fact one can now separate what works from what works FOR NOBODY. Without the fact it
            stays at INSTANTIATED: it does not inform, and that is an answer, not a gap.
        */
        if (subscribers === undefined) return { health: EComponentHealth.INSTANTIATED }
        if (subscribers > 0) return { health: EComponentHealth.ACTIVE }
        return {
            health: EComponentHealth.IDLE,
            reason: 'Running, but nothing is consuming it right now'
        }
    }

    private buildInventory = async (): Promise<IStatusInventory> => {
        const components: IStatusComponent[] = []
        /*
            The edges are asked for ONCE and counted per producer, rather than walked inside the loop:
            with a few dozen subscriptions it makes no difference, but the nested loop would be the first
            thing to show the day a Kwirth has many.
        */
        const edges = this.subscriptionsOf()
        const conocidos = new Map<string, number>()
        for (const e of edges) conocidos.set(e.providerId, (conocidos.get(e.providerId) ?? 0) + 1)

        for (const p of this.clusterInfo.providers ?? []) {
            const subscribers = this.subscribersOf(p)
            const eventos = this.eventsOf(p)
            const { health, reason } = this.healthOfProvider(p, subscribers)
            components.push({
                kind: EComponentKind.PROVIDER,
                id: p.id,
                displayName: p.id,
                health,
                ...(reason ? { reason } : {}),
                ...(subscribers === undefined ? {} : { subscribers }),
                ...(eventos === undefined ? {} : { events: eventos }),
                knownConsumers: conocidos.get(p.id) ?? 0
            })
        }

        /*
            A pluvider exists because its plugin is installed and running, not because anybody declares
            it: if it is in the registry, it is up. There is no intermediate state to find out.
        */
        for (const pluviderId of (this.clusterInfo.pluviders ?? new Map()).keys()) {
            /*
                A pluvider does not implement IProvider, so there is no getStats to ask it: the only thing
                known about it is what the core brokered. Here the graph does NOT fall short — it is the
                only source — and that is why its count is given as 'subscribers' and not merely as known ones.
            */
            const suyas = conocidos.get(pluviderId) ?? 0
            components.push({
                kind: EComponentKind.PLUVIDER,
                id: pluviderId,
                displayName: pluviderId,
                health: suyas > 0 ? EComponentHealth.ACTIVE : EComponentHealth.IDLE,
                ...(suyas > 0 ? {} : { reason: 'Running, but nothing is consuming it right now' }),
                subscribers: suyas,
                knownConsumers: suyas
            })
        }

        /*
            Senders and webhooks are listed through their access registry. Their 'health' is simpler: if
            they are registered, they are available. What adds information is how many configurations they
            have — a sender with none is installed but cannot deliver anything.

            ⚠️ The webhooks' URL is NOT taken. `getUrl()` returns it with the TOKEN inside, and this screen
            may be being looked at by somebody who must not know it.
        */
        for (const s of this.clusterInfo.senders?.listSenders() ?? []) {
            components.push({
                kind: EComponentKind.SENDER,
                id: s.id,
                displayName: s.id,
                health: EComponentHealth.INSTANTIATED,
                reason: s.configNames.length === 0 ? 'Installed, but it has no configuration yet, so it cannot deliver anything' : undefined
            })
        }

        for (const w of this.clusterInfo.webhooks?.listWebhooks() ?? []) {
            components.push({
                kind: EComponentKind.WEBHOOK,
                id: w.id,
                displayName: w.id,
                health: EComponentHealth.INSTANTIATED,
                reason: w.configNames.length === 0 ? 'Installed, but it has no configuration yet, so nothing can reach it' : undefined
            })
        }

        const routes = toStatusRoutes(this.clusterInfo.routes)
        const dces = await toStatusDces(this.clusterInfo.dces)
        const plugins = await toStatusPlugins(this.clusterInfo.plugins)
        /*
            The core's own log lines, from the internal 'corelog' provider. Only present when the core has
            no Kubernetes API (the provider is instantiated conditionally). In a pod the Status plugin
            reads the log through the REST endpoint instead, and this field is absent.
        */
        const coreLogProvider = (this.clusterInfo.providers ?? []).find(p => p.id === 'corelog')
        const coreLogLines = coreLogProvider?.getLogLines?.()
        const sql = await this.buildSqlInfo()

        return {
            cluster: this.clusterInfo.name ?? '',
            takenAt: Date.now(),
            components,
            edges,
            process: this.probe.sample(),
            ...(routes ? { routes } : {}),
            ...(dces ? { dces } : {}),
            ...(plugins ? { plugins } : {}),
            ...(coreLogLines ? { coreLogLines } : {}),
            ...(sql ? { sql } : {})
        }
    }

    /**
     * The core's SQL/Postgres support: connection config (from the same `KWIRTH_SQL_*` env the core reads),
     * driver/ORM versions, reachability and the list of databases.
     *
     * It reaches `common-sql` through the `__kwirth_back__` global the core exposes, so nothing is bundled.
     * When the global is absent (an older core without common-sql) this returns `undefined` and the field
     * stays absent from the inventory — "unknown", not "no SQL". The password is never read or sent.
     */
    private buildSqlInfo = async (): Promise<IStatusSqlInfo | undefined> => {
        const sqlLib = (global as { __kwirth_back__?: { kwirthCommonSql?: { listDbs: () => Promise<string[]>, listPools: () => IStatusSqlPool[], describeError: (err: unknown) => string } } }).__kwirth_back__?.kwirthCommonSql
        if (!sqlLib) return undefined

        const client = process.env.KWIRTH_SQL_CLIENT || 'pg'
        const host = process.env.KWIRTH_SQL_HOST || 'localhost'
        const port = Number(process.env.KWIRTH_SQL_PORT || 5432)
        const user = process.env.KWIRTH_SQL_USER || 'postgres'
        const ssl = process.env.KWIRTH_SQL_SSL === 'true'
        const maintenanceDb = process.env.KWIRTH_SQL_MAINTDB || 'postgres'

        let knexVersion: string | undefined
        let pgVersion: string | undefined
        try { knexVersion = require('knex/package.json').version } catch { /* best-effort */ }
        try { pgVersion = require('pg/package.json').version } catch { /* best-effort */ }

        // Pool stats are always available (listPools is synchronous and reads the live pools Map); they do
        // not depend on the server being reachable. A pool that is open but whose connection is stale still
        // reports its used/free counts.
        let pools: IStatusSqlPool[] = []
        try { pools = sqlLib.listPools() } catch { /* best-effort */ }

        try {
            const databases = await sqlLib.listDbs()
            return { client, host, port, user, ssl, maintenanceDb, reachable: true, databases, pools, ...(knexVersion ? { knexVersion } : {}), ...(pgVersion ? { pgVersion } : {}) }
        }
        catch (err) {
            return { client, host, port, user, ssl, maintenanceDb, reachable: false, databases: [], pools, ...(knexVersion ? { knexVersion } : {}), ...(pgVersion ? { pgVersion } : {}), error: sqlLib.describeError(err) }
        }
    }

    /**
     * The edges the core knows about. Guarded just like getStats: if the core predates this or blows up,
     * an empty list is returned and the screen shows the inventory without a graph.
     */
    private subscriptionsOf = (): IStatusEdge[] => {
        if (!this.clusterInfo.getSubscriptions) return []
        try {
            return toStatusEdges(this.clusterInfo.getSubscriptions() ?? [])
        }
        catch {
            return []
        }
    }

    private sendInventory = async (socket: ISocketEntry, instanceId: string): Promise<void> => {
        const inventory = await this.buildInventory()
        const msg: IStatusMessageResponse = {
            msgtype: 'statusmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instanceId,
            payloadType: EStatusPayload.INVENTORY,
            inventory
        }
        socket.ws.send(JSON.stringify(msg))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const msg: ISignalMessage = {
            action,
            flow,
            level,
            channel: this.channelId,
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        ws.send(JSON.stringify(msg))
    }
}

export { StatusChannel }
export default StatusChannel
