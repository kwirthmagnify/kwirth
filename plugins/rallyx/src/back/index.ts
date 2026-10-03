import { BackChannelData, EClusterType, IBackChannelObject, IChannel, IInstanceConfig, IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction } from '@kwirthmagnify/kwirth-common-back'
import { IChannelInstances } from '@kwirthmagnify/kwirth-common'

/**
 * Back channel for Rally-X.
 *
 * The game runs entirely in the browser (Phaser + iframe); the back only
 * persists the high-score table.
 *
 * Persistence uses `writeStorage`, which the core injects into the
 * backChannelObject and which ends up in a ConfigMap named
 * `kwirth-store-channel-rallyx-scores`. That makes the table belong to the
 * cluster, not the browser: every user of that Kwirth sees it.
 *
 * Transport is the tab's websocket, not an HTTP endpoint.
 * The accessKey IS required: the core demands it on every command that enters
 * the socket and discards the message without it, before looking at the channel.
 */

const STORAGE_KEY = 'rallyx-scores'
const MAX_SCORES = 10
/** Name cap. The name is the logged-in user. */
const MAX_NAME = 24

export const MSG_SCORES_GET = 'rallyx-scores-get'
export const MSG_SCORE_SUBMIT = 'rallyx-score-submit'
export const MSG_SCORES = 'rallyx-scores'

interface IScoreEntry {
    name: string
    score: number
    level: number
    date: string
}

interface IInstance {
    instanceId: string
    webSocket: WebSocket
    /*
        Sender to notify when the record is beaten, chosen in the channel setup.
    */
    senderId?: string
    senderConfigName?: string
}

/** Sanitize: never trust what the front sends. */
const sanitize = (raw: any): IScoreEntry | undefined => {
    if (!raw || typeof raw !== 'object') return undefined
    const score = Number(raw.score)
    if (!Number.isFinite(score) || score <= 0) return undefined
    const level = Number(raw.level)
    return {
        name: String(raw.name ?? 'anon').replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME) || 'anon',
        score: Math.floor(score),
        level: Number.isFinite(level) ? Math.floor(level) : 0,
        date: new Date().toISOString(),
    }
}

const sortAndTrim = (entries: IScoreEntry[]): IScoreEntry[] =>
    [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES)

class RallyxBackChannel implements IChannel {
    readonly channelId = 'rallyx'
    readonly requirements = { storage: true, providers: [] as string[] }
    clusterInfo: any
    backChannelObject: IBackChannelObject

    private instances: IInstance[] = []

    /**
     * Write queue. Read, insert and write on a ConfigMap is not atomic:
     * two games ending at the same time could overwrite each other.
     */
    private queue: Promise<any> = Promise.resolve()

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'rallyx',
        routable: false,
        pauseable: true,
        modifiable: false,
        reconnectable: false,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: false,
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none'].indexOf(scope)

    startChannel = async (): Promise<void> => { }

    endpointRequest = (): void => { }
    websocketRequest = (): void => { }
    processProviderEvent = (): void => { }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        const data = (instanceConfig.data ?? {}) as { senderId?: string, senderConfigName?: string }
        this.instances.push({
            instanceId: instanceConfig.instance,
            webSocket,
            senderId: data.senderId,
            senderConfigName: data.senderConfigName,
        })
        return true
    }

    deleteObject = async (): Promise<boolean> => false

    pauseContinueInstance = (): void => { }
    modifyInstance = (): void => { }

    containsInstance = (instanceId: string): boolean =>
        this.instances.some(i => i.instanceId === instanceId)

    getInstances = (): IChannelInstances => ({
        instances: this.instances.length,
        connections: new Set(this.instances.map(i => i.webSocket)).size,
    })

    containsAsset = (): boolean => false

    stopInstance = (_webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.instances = this.instances.filter(i => i.instanceId !== instanceConfig.instance)
    }

    removeInstance = (_webSocket: WebSocket, instanceId: string): void => {
        this.instances = this.instances.filter(i => i.instanceId !== instanceId)
    }

    containsConnection = (webSocket: WebSocket): boolean =>
        this.instances.some(i => i.webSocket === webSocket)

    removeConnection = (webSocket: WebSocket): void => {
        this.instances = this.instances.filter(i => i.webSocket !== webSocket)
    }

    refreshConnection = (): boolean => true
    updateConnection = (): boolean => true

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        const msg = instanceMessage as any

        switch (msg.msgtype) {
            case MSG_SCORES_GET:
                this.queue = this.queue.then(async () => {
                    const scores = await this.read()
                    this.reply(webSocket, instanceMessage, scores)
                })
                return true

            case MSG_SCORE_SUBMIT:
                this.queue = this.queue.then(async () => {
                    const entry = sanitize(msg.entry)
                    const current = await this.read()
                    const updated = entry ? sortAndTrim([...current, entry]) : current
                    if (entry) {
                        try {
                            await this.backChannelObject.writeStorage!(STORAGE_KEY, false, updated)
                        }
                        catch (err) {
                            this.backChannelObject.logError?.(`rallyx: could not save the score: ${err}`)
                            this.reply(webSocket, instanceMessage, current)
                            return
                        }
                        this.notifyRecord(instanceMessage.instance, current, updated, entry)
                    }
                    this.broadcast(instanceMessage, updated)
                })
                return true

            default:
                return false
        }
    }

    private notifyRecord = (instanceId: string, before: IScoreEntry[], after: IScoreEntry[], entry: IScoreEntry): void => {
        const instance = this.instances.find(i => i.instanceId === instanceId)
        if (!instance?.senderId || !instance.senderConfigName) return
        if (after[0] !== entry) return
        if (before.length > 0 && entry.score <= before[0].score) return

        const previous = before.length > 0 ? `${before[0].name} (${before[0].score})` : 'nobody'
        this.backChannelObject.senders?.send(instance.senderId, instance.senderConfigName, {
            subject: `Rally-X: new record by ${entry.name}`,
            body: `${entry.name} scored ${entry.score} points on round ${entry.level}. `
                + `The previous record was held by ${previous}.`,
        })?.catch?.((err: unknown) => {
            this.backChannelObject.logWarning?.(`rallyx: could not notify the record: ${err}`)
        })
    }

    private read = async (): Promise<IScoreEntry[]> => {
        try {
            const stored = await this.backChannelObject.readStorage!(STORAGE_KEY, false)
            if (!Array.isArray(stored)) return []
            return sortAndTrim(stored.map(sanitize).filter((e): e is IScoreEntry => e !== undefined))
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`rallyx: unreadable score table, starting empty: ${err}`)
            return []
        }
    }

    private reply = (webSocket: WebSocket, source: IInstanceMessage, scores: IScoreEntry[]): void => {
        const response = {
            msgtype: MSG_SCORES,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            channel: 'rallyx',
            instance: source.instance,
            scores,
        }
        try { webSocket.send(JSON.stringify(response)) }
        catch { /* socket down: will be cleaned in removeConnection */ }
    }

    private broadcast = (source: IInstanceMessage, scores: IScoreEntry[]): void => {
        for (const instance of this.instances) {
            const response = {
                msgtype: MSG_SCORES,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.RESPONSE,
                type: EInstanceMessageType.DATA,
                channel: 'rallyx',
                instance: instance.instanceId,
                scores,
            }
            try { instance.webSocket.send(JSON.stringify(response)) }
            catch { /* same */ }
        }
        void source
    }
}

export default RallyxBackChannel
