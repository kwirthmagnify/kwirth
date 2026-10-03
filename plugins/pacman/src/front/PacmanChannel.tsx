import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ENotifyLevel, ESignalMessageLevel, IInstanceMessage, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { FC } from 'react'
import { PacmanConfig, PacmanInstanceConfig, IPacmanConfig } from './PacmanConfig'
import { PacmanData, IPacmanData } from './PacmanData'
import { PacmanSetup, PacmanIcon } from './PacmanSetup'
import { PacmanTabContent } from './PacmanTabContent'
import { PacmanMachine } from './PacmanMachine'
import { BackScoreStore, LocalScoreStore, MSG_SCORES, sanitizeEntries, socketSender } from './PacmanScores'

/**
 * Canal Pac-Man.
 *
 * El contrato de IChannel trae start/pause/continue/stop, que es el ciclo de
 * vida del juego. start crea o reinicia la maquina, pause y continue la
 * congelan y la reanudan, stop la descarta.
 */
export class PacmanChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = PacmanSetup
    TabContent: FC<IContentProps> = PacmanTabContent
    channelId = 'pacman'
    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: false,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return PacmanIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IInstanceMessage = JSON.parse(wsEvent.data)
        const pacmanData: IPacmanData = channelObject.data

        const signal = msg as ISignalMessage
        if (msg.type === EInstanceMessageType.SIGNAL && signal.level === ESignalMessageLevel.ERROR) {
            channelObject.notify?.(channelObject.channelId, ENotifyLevel.ERROR,
                signal.text || 'The channel reported an error')
            return { action: EChannelRefreshAction.NONE }
        }

        if (msg.type === EInstanceMessageType.SIGNAL
            && msg.flow === EInstanceMessageFlow.RESPONSE
            && msg.action === EInstanceMessageAction.START) {
            if (!msg.instance) {
                channelObject.notify?.(channelObject.channelId, ENotifyLevel.ERROR,
                    'The channel did not start: the server returned no instance.')
                return { action: EChannelRefreshAction.NONE }
            }
            channelObject.instanceId = msg.instance
            this.attachScoreStore(channelObject)
            void pacmanData.scoreStore?.load().then((entries) => {
                pacmanData.scores = entries
                pacmanData.highScore = Math.max(pacmanData.highScore, entries[0]?.score ?? 0)
                pacmanData.revision++
            })
            return { action: EChannelRefreshAction.REFRESH }
        }

        if ((msg as any).msgtype === MSG_SCORES) {
            const entries = sanitizeEntries((msg as any).scores)
            pacmanData.scores = entries
            pacmanData.highScore = Math.max(pacmanData.highScore, entries[0]?.score ?? 0)
            pacmanData.revision++
            const store = pacmanData.scoreStore
            if (store instanceof BackScoreStore) store.resolve(entries)
            return { action: EChannelRefreshAction.REFRESH }
        }

        return { action: EChannelRefreshAction.NONE }
    }

    private attachScoreStore(channelObject: IChannelObject): void {
        const pacmanData: IPacmanData = channelObject.data

        if (!channelObject.webSocket) {
            if (!pacmanData.scoreStore) pacmanData.scoreStore = new LocalScoreStore()
            return
        }
        if (pacmanData.scoreStore instanceof BackScoreStore) return

        pacmanData.scoreStore = new BackScoreStore(
            socketSender(() => channelObject.webSocket),
            () => channelObject.instanceId ?? '',
            () => channelObject.accessString ?? ''
        )
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new PacmanInstanceConfig()
        channelObject.config = new PacmanConfig()
        const pacmanData: IPacmanData = channelObject.data = new PacmanData()
        pacmanData.scores = []
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const pacmanData: IPacmanData = channelObject.data

        // Crear la maquina del juego (iframe). Vive en channelObject.data
        // para sobrevivir a los cambios de pestana.
        if (!pacmanData.machine) {
            pacmanData.machine = new PacmanMachine()
            pacmanData.machine.init()
        }

        pacmanData.started = true
        pacmanData.paused = false
        pacmanData.gameOver = false
        pacmanData.pendingScore = false
        pacmanData.revision++
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const pacmanData: IPacmanData = channelObject.data
        pacmanData.paused = true
        pacmanData.revision++
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const pacmanData: IPacmanData = channelObject.data
        pacmanData.paused = false
        pacmanData.revision++
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const pacmanData: IPacmanData = channelObject.data
        const pacmanConfig: IPacmanConfig = channelObject.config
        if (pacmanData.score > pacmanData.highScore) {
            pacmanData.highScore = pacmanData.score
        }
        void pacmanConfig
        pacmanData.pendingScore = false
        pacmanData.machine?.dispose()
        pacmanData.machine = undefined
        pacmanData.started = false
        pacmanData.paused = false
        pacmanData.score = 0
        pacmanData.lives = 0
        pacmanData.level = 0
        pacmanData.gameOver = false
        pacmanData.revision++
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
