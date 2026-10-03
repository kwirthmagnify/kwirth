import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ENotifyLevel, ESignalMessageLevel, IInstanceMessage, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { FC } from 'react'
import { RallyxConfig, RallyxInstanceConfig, IRallyxConfig } from './RallyxConfig'
import { RallyxData, IRallyxData } from './RallyxData'
import { RallyxSetup, RallyxIcon } from './RallyxSetup'
import { RallyxTabContent } from './RallyxTabContent'
import { RallyxMachine } from './RallyxMachine'
import { IRallyxInstanceConfig } from '../common/RallyxTypes'
import { BackScoreStore, LocalScoreStore, MSG_SCORES, sanitizeEntries, socketSender } from './RallyxScores'

/**
 * Rally-X channel.
 *
 * The IChannel contract brings start/pause/continue/stop, which is the game
 * lifecycle. start creates or resets the machine, pause and continue freeze
 * and resume it, stop discards it.
 */
export class RallyxChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = RallyxSetup
    TabContent: FC<IContentProps> = RallyxTabContent
    channelId = 'rallyx'
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
    getChannelIcon(): JSX.Element { return RallyxIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IInstanceMessage = JSON.parse(wsEvent.data)
        const rallyxData: IRallyxData = channelObject.data

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
            void rallyxData.scoreStore?.load().then((entries) => {
                rallyxData.scores = entries
                rallyxData.highScore = Math.max(rallyxData.highScore, entries[0]?.score ?? 0)
                rallyxData.revision++
            })
            return { action: EChannelRefreshAction.REFRESH }
        }

        if ((msg as any).msgtype === MSG_SCORES) {
            const entries = sanitizeEntries((msg as any).scores)
            rallyxData.scores = entries
            rallyxData.highScore = Math.max(rallyxData.highScore, entries[0]?.score ?? 0)
            rallyxData.revision++
            const store = rallyxData.scoreStore
            if (store instanceof BackScoreStore) store.resolve(entries)
            return { action: EChannelRefreshAction.REFRESH }
        }

        return { action: EChannelRefreshAction.NONE }
    }

    private attachScoreStore(channelObject: IChannelObject): void {
        const rallyxData: IRallyxData = channelObject.data

        if (!channelObject.webSocket) {
            if (!rallyxData.scoreStore) rallyxData.scoreStore = new LocalScoreStore()
            return
        }
        if (rallyxData.scoreStore instanceof BackScoreStore) return

        rallyxData.scoreStore = new BackScoreStore(
            socketSender(() => channelObject.webSocket),
            () => channelObject.instanceId ?? '',
            () => channelObject.accessString ?? ''
        )
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new RallyxInstanceConfig()
        channelObject.config = new RallyxConfig()
        const rallyxData: IRallyxData = channelObject.data = new RallyxData()
        rallyxData.scores = []
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const rallyxData: IRallyxData = channelObject.data

        // Create the game machine (iframe + Phaser). It lives in channelObject.data
        // to survive tab switches.
        if (!rallyxData.machine) {
            rallyxData.machine = new RallyxMachine()
            rallyxData.machine.onState = (state) => {
                if (state.score !== undefined) rallyxData.score = state.score
                if (state.lives !== undefined) rallyxData.lives = state.lives
                if (state.round !== undefined) rallyxData.round = state.round
                if (state.fuel !== undefined) rallyxData.fuel = state.fuel
                if (state.highScore !== undefined && state.highScore > rallyxData.highScore) {
                    rallyxData.highScore = state.highScore
                }
                rallyxData.revision++
            }
            rallyxData.machine.onGameOver = (score, round) => {
                rallyxData.gameOver = true
                rallyxData.score = score
                rallyxData.round = round
                rallyxData.pendingScore = true
                rallyxData.revision++
            }
            rallyxData.machine.init()
        }

        rallyxData.started = true
        rallyxData.paused = false
        rallyxData.gameOver = false
        rallyxData.pendingScore = false
        rallyxData.revision++
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const rallyxData: IRallyxData = channelObject.data
        rallyxData.paused = true
        rallyxData.revision++
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const rallyxData: IRallyxData = channelObject.data
        rallyxData.paused = false
        rallyxData.revision++
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const rallyxData: IRallyxData = channelObject.data
        const rallyxConfig: IRallyxConfig = channelObject.config
        if (rallyxData.score > rallyxData.highScore) {
            rallyxData.highScore = rallyxData.score
        }
        void rallyxConfig
        rallyxData.pendingScore = false
        rallyxData.machine?.dispose()
        rallyxData.machine = undefined
        rallyxData.started = false
        rallyxData.paused = false
        rallyxData.score = 0
        rallyxData.lives = 0
        rallyxData.round = 0
        rallyxData.fuel = 0
        rallyxData.gameOver = false
        rallyxData.revision++
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
