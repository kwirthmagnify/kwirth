import { BackChannelData, EClusterType, IBackChannelObject, IChannel, IInstanceConfig, IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction } from '@kwirthmagnify/kwirth-common-back'
import { IChannelInstances } from '@kwirthmagnify/kwirth-common'

/**
 * Back del canal Pac-Man.
 *
 * La partida corre entera en el navegador (iframe); el back solo guarda el marcador.
 *
 * Se persiste con `writeStorage`, que el core inyecta siempre en el
 * backChannelObject y que acaba en un ConfigMap llamado
 * `kwirth-store-channel-pacman-scores`. Eso hace que la tabla sea del cluster y
 * no del navegador: la ven todos los usuarios de ese Kwirth.
 *
 * El transporte es el websocket de la pestana, no un endpoint HTTP.
 * El accessKey SI hace falta: el core lo exige en TODO comando que entra por el
 * socket y descarta el mensaje sin el, antes de mirar el canal.
 */

const STORAGE_KEY = 'pacman-scores'
const MAX_SCORES = 10
/** Tope del nombre. El nombre es el usuario logado. */
const MAX_NAME = 24

export const MSG_SCORES_GET = 'pacman-scores-get'
export const MSG_SCORE_SUBMIT = 'pacman-score-submit'
export const MSG_SCORES = 'pacman-scores'

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
        Sender al que avisar cuando se bate el record, elegido en el setup del canal.
    */
    senderId?: string
    senderConfigName?: string
}

/** Saneado: nunca confiar en lo que manda el front. */
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

class PacmanBackChannel implements IChannel {
    readonly channelId = 'pacman'
    readonly requirements = { storage: true, providers: [] as string[] }
    clusterInfo: any
    backChannelObject: IBackChannelObject

    private instances: IInstance[] = []

    /**
     * Cola de escritura. Leer, insertar y escribir sobre un ConfigMap no es
     * atomico: dos partidas que terminan a la vez podrian pisarse.
     */
    private queue: Promise<any> = Promise.resolve()

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'pacman',
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
                            this.backChannelObject.logError?.(`pacman: no se pudo guardar el marcador: ${err}`)
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

        const previous = before.length > 0 ? `${before[0].name} (${before[0].score})` : 'nadie'
        this.backChannelObject.senders?.send(instance.senderId, instance.senderConfigName, {
            subject: `Pac-Man: nuevo record de ${entry.name}`,
            body: `${entry.name} ha hecho ${entry.score} puntos en el nivel ${entry.level}. `
                + `El record anterior lo tenia ${previous}.`,
        })?.catch?.((err: unknown) => {
            this.backChannelObject.logWarning?.(`pacman: no se pudo notificar el record: ${err}`)
        })
    }

    private read = async (): Promise<IScoreEntry[]> => {
        try {
            const stored = await this.backChannelObject.readStorage!(STORAGE_KEY, false)
            if (!Array.isArray(stored)) return []
            return sortAndTrim(stored.map(sanitize).filter((e): e is IScoreEntry => e !== undefined))
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`pacman: marcador ilegible, se empieza vacio: ${err}`)
            return []
        }
    }

    private reply = (webSocket: WebSocket, source: IInstanceMessage, scores: IScoreEntry[]): void => {
        const response = {
            msgtype: MSG_SCORES,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            channel: 'pacman',
            instance: source.instance,
            scores,
        }
        try { webSocket.send(JSON.stringify(response)) }
        catch { /* socket caido: se limpiara en removeConnection */ }
    }

    private broadcast = (source: IInstanceMessage, scores: IScoreEntry[]): void => {
        for (const instance of this.instances) {
            const response = {
                msgtype: MSG_SCORES,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.RESPONSE,
                type: EInstanceMessageType.DATA,
                channel: 'pacman',
                instance: instance.instanceId,
                scores,
            }
            try { instance.webSocket.send(JSON.stringify(response)) }
            catch { /* idem */ }
        }
        void source
    }
}

export default PacmanBackChannel
