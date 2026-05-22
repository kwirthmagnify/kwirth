import { FC } from 'react'
import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope, ISignalMessage, ENotifyLevel, IChannelRequirements, IChannelMessageAction, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IContentProps, ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { CensorSetup, CensorIcon } from './CensorSetup'
import { CensorTabContent } from './CensorTabContent'
import { CensorConfig, ICensorInstanceConfig } from './CensorConfig'
import { CensorData, ICensorAsset, ICensorData, ICensorRegex } from './CensorData'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'

const MAX_DISPLAY_LINES = 5000

interface ICensorMessage {
    msgtype: string
    type: EInstanceMessageType
    flow: EInstanceMessageFlow
    action: EInstanceMessageAction
    instance: string
    kind?: 'received' | 'llminput' | 'llmoutput' | 'llmwarning' | 'regex' | 'status' | 'config' | 'providers' | 'analyzing' | 'stats' | 'assets'
    assets?: ICensorAsset[]
    analyzing?: boolean
    text?: string
    namespace?: string
    pod?: string
    container?: string
    pattern?: string
    example?: string
    explanation?: string
    tags?: string[]
    processedCount?: number
    llmCount?: number
    instanceConfig?: ICensorInstanceConfig
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
}

export class CensorChannel implements IChannel {
    channelId = 'censor'
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = CensorSetup
    TabContent: FC<IContentProps> = CensorTabContent
    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
    }

    getScope() { return EInstanceConfigScope.VIEW }
    getChannelIcon(): JSX.Element { return CensorIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: ICensorMessage = JSON.parse(wsEvent.data)
        const data: ICensorData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.instance && !channelObject.instanceId) channelObject.instanceId = msg.instance
                if (msg.kind === 'received' && msg.text !== undefined) {
                    data.receivedLines.push({ text: msg.text, namespace: msg.namespace ?? '', pod: msg.pod ?? '', container: msg.container ?? '' })
                    if (data.receivedLines.length > MAX_DISPLAY_LINES) data.receivedLines.splice(0, data.receivedLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'llminput' && msg.text !== undefined) {
                    data.llmInputLines.push(msg.text)
                    if (data.llmInputLines.length > MAX_DISPLAY_LINES) data.llmInputLines.splice(0, data.llmInputLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'llmoutput' && msg.text !== undefined) {
                    data.llmOutputLines.push(msg.text)
                    if (data.llmOutputLines.length > MAX_DISPLAY_LINES) data.llmOutputLines.splice(0, data.llmOutputLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'llmwarning' && msg.text !== undefined) {
                    data.llmWarningLines.push({ original: msg.text, explanation: msg.explanation ?? '' })
                    if (data.llmWarningLines.length > MAX_DISPLAY_LINES) data.llmWarningLines.splice(0, data.llmWarningLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'regex' && msg.pattern !== undefined) {
                    if (!data.regexes.some((r: ICensorRegex) => r.pattern === msg.pattern)) {
                        data.regexes.push({ pattern: msg.pattern, example: msg.example ?? '', explanation: msg.explanation ?? '' })
                    }
                }
                else if (msg.kind === 'stats') {
                    if (msg.processedCount !== undefined) data.processedCount = msg.processedCount
                    if (msg.llmCount !== undefined) data.llmCount = msg.llmCount
                }
                else if (msg.kind === 'config') {
                    if (msg.llms !== undefined) data.llms = msg.llms
                    if (msg.providers !== undefined) data.providers = msg.providers
                    if (msg.providersAvailable !== undefined) data.providersAvailable = msg.providersAvailable
                    if (msg.instanceConfig) data.instanceConfig = msg.instanceConfig
                }
                else if (msg.kind === 'providers') {
                    if (msg.providers !== undefined) data.providers = msg.providers
                    if (msg.providersAvailable !== undefined) data.providersAvailable = msg.providersAvailable
                }
                else if (msg.kind === 'analyzing' && msg.analyzing !== undefined) {
                    data.analyzing = msg.analyzing
                }
                else if (msg.kind === 'assets' && msg.assets !== undefined) {
                    data.assets = msg.assets
                }
                return { action: EChannelRefreshAction.REFRESH }

            case EInstanceMessageType.SIGNAL:
                const signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    if (signalMessage.instance) {
                        channelObject.instanceId = signalMessage.instance
                        channelObject.webSocket?.send(JSON.stringify({
                            msgtype: 'censormessage', channel: 'censor',
                            action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.REQUEST,
                            type: EInstanceMessageType.DATA,
                            accessKey: channelObject.accessString!,
                            instance: signalMessage.instance,
                            command: 'configget'
                        }))
                    } else {
                        channelObject.notify?.(this.channelId, signalMessage.level as unknown as ENotifyLevel, signalMessage.text || '')
                    }
                }
                else {
                    channelObject.notify?.(this.channelId, signalMessage.level as unknown as ENotifyLevel, signalMessage.text || '')
                }
                return { action: EChannelRefreshAction.REFRESH }

            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.config = new CensorConfig()
        channelObject.data = new CensorData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: ICensorData = channelObject.data
        data.receivedLines = []
        data.llmInputLines = []
        data.llmOutputLines = []
        data.llmWarningLines = []
        data.regexes = []
        data.assets = []
        data.processedCount = 0
        data.llmCount = 0
        data.paused = false
        data.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const data: ICensorData = channelObject.data
        data.paused = true
        return false
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const data: ICensorData = channelObject.data
        data.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: ICensorData = channelObject.data
        data.paused = false
        data.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean {
        return false
    }

    socketReconnect(_channelObject: IChannelObject): boolean {
        return false
    }
}
