import { FC } from 'react'
import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope, ISignalMessage, ENotifyLevel, IChannelRequirements, IChannelMessageAction, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IContentProps, ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { CensorSetup, CensorIcon } from './CensorSetup'
import { CensorTabContent } from './CensorTabContent'
import { CensorConfig, ECensorCommand, ICensorConfig, ICensorInstanceConfig, ICensorSession } from './CensorConfig'
import { CensorData, ICensorAsset, ICensorData, ICensorRegex } from './CensorData'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'

const MAX_DISPLAY_LINES = 5000

interface ICensorMessage {
    msgtype: string
    type: EInstanceMessageType
    flow: EInstanceMessageFlow
    action: EInstanceMessageAction
    instance: string
    kind?: 'received' | 'business' | 'llminput' | 'llmoutput' | 'llmwarning' | 'llmerror' | 'regex' | 'status' | 'config' | 'providers' | 'analyzing' | 'stats' | 'assets' | 'tags' | 'sessions' | 'sessionstarted' | 'sessionstopped' | 'sessionconnected' | 'sessiondisconnected'
    assets?: ICensorAsset[]
    analyzing?: boolean
    text?: string
    lines?: { text: string, namespace: string, pod: string, container: string }[]
    namespace?: string
    pod?: string
    container?: string
    pattern?: string
    example?: string
    explanation?: string
    tags?: string[]
    processedCount?: number
    llmCount?: number
    tokensIn?: number
    tokensOut?: number
    pendingCount?: number
    instanceConfig?: ICensorInstanceConfig
    configs?: ICensorInstanceConfig[]
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
    sessions?: ICensorSession[]
    sessionId?: string
    sessionDescription?: string
    regexes?: ICensorRegex[]
    timestamp?: string
}

export class CensorChannel implements IChannel {
    channelId = 'censor'
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = CensorSetup
    TabContent: FC<IContentProps> = CensorTabContent
    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
        backChannels: false,
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
                if (msg.kind === 'received') {
                    if (msg.lines) {
                        data.receivedLines.push(...msg.lines)
                    } else if (msg.text !== undefined) {
                        data.receivedLines.push({ text: msg.text, namespace: msg.namespace ?? '', pod: msg.pod ?? '', container: msg.container ?? '' })
                    }
                    if (data.receivedLines.length > MAX_DISPLAY_LINES) data.receivedLines.splice(0, data.receivedLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'business' && msg.text !== undefined) {
                    data.businessLines.push({ text: msg.text, namespace: msg.namespace ?? '', pod: msg.pod ?? '', container: msg.container ?? '', timestamp: msg.timestamp })
                    if (data.businessLines.length > MAX_DISPLAY_LINES) data.businessLines.splice(0, data.businessLines.length - MAX_DISPLAY_LINES)
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
                    const tags = msg.tags ?? []
                    data.llmWarningLines.push({ original: msg.text, explanation: msg.explanation ?? '', tags })
                    if (data.llmWarningLines.length > MAX_DISPLAY_LINES) data.llmWarningLines.splice(0, data.llmWarningLines.length - MAX_DISPLAY_LINES)
                    for (const tag of tags) {
                        if (!data.allTags.includes(tag)) data.allTags.push(tag)
                    }
                }
                else if (msg.kind === 'llmerror' && msg.text !== undefined) {
                    data.llmErrorLines.push({ text: msg.text, timestamp: msg.timestamp ?? new Date().toISOString() })
                    if (data.llmErrorLines.length > MAX_DISPLAY_LINES) data.llmErrorLines.splice(0, data.llmErrorLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'regex' && msg.pattern !== undefined) {
                    if (!data.regexes.some((r: ICensorRegex) => r.pattern === msg.pattern)) {
                        data.regexes.push({ pattern: msg.pattern, example: msg.example ?? '', explanation: msg.explanation ?? '', matches: 1 })
                    }
                }
                else if (msg.kind === 'stats') {
                    if (msg.processedCount !== undefined) data.processedCount = msg.processedCount
                    if (msg.llmCount !== undefined) data.llmCount = msg.llmCount
                    if (msg.tokensIn !== undefined) data.tokensIn = msg.tokensIn
                    if (msg.tokensOut !== undefined) data.tokensOut = msg.tokensOut
                    if (msg.pendingCount !== undefined) data.pendingCount = msg.pendingCount
                    if (Array.isArray((msg as any).regexMatches)) {
                        for (const rm of (msg as any).regexMatches as { pattern: string; matches: number }[]) {
                            const rx = data.regexes.find((r: ICensorRegex) => r.pattern === rm.pattern)
                            if (rx) rx.matches = rm.matches
                        }
                    }
                }
                else if (msg.kind === 'config') {
                    if (msg.llms !== undefined) data.llms = msg.llms
                    if (msg.providers !== undefined) data.providers = msg.providers
                    if (msg.providersAvailable !== undefined) data.providersAvailable = msg.providersAvailable
                    if (msg.instanceConfig) data.instanceConfig = msg.instanceConfig
                    if (msg.configs !== undefined) data.configs = msg.configs
                    if (msg.sessions !== undefined) data.sessions = msg.sessions
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
                else if (msg.kind === 'tags' && msg.tags !== undefined) {
                    for (const tag of msg.tags) {
                        if (!data.allTags.includes(tag)) data.allTags.push(tag)
                    }
                }
                else if (msg.kind === 'sessions' && msg.sessions !== undefined) {
                    data.sessions = msg.sessions
                }
                else if (msg.kind === 'sessionstarted' && msg.sessionId !== undefined) {
                    data.connectedSessionId = msg.sessionId
                    data.connectedSessionDescription = msg.sessionDescription ?? null
                    if (msg.sessions !== undefined) data.sessions = msg.sessions
                    if (msg.analyzing !== undefined) data.analyzing = msg.analyzing
                    ;(channelObject.config as ICensorConfig).selectedSessionId = msg.sessionId
                }
                else if (msg.kind === 'sessionconnected' && msg.sessionId !== undefined) {
                    data.connectedSessionId = msg.sessionId
                    data.connectedSessionDescription = msg.sessionDescription ?? null
                    if (msg.sessions !== undefined) data.sessions = msg.sessions
                    if (msg.processedCount !== undefined) data.processedCount = msg.processedCount
                    if (msg.llmCount !== undefined) data.llmCount = msg.llmCount
                    if (msg.tokensIn !== undefined) data.tokensIn = msg.tokensIn
                    if (msg.tokensOut !== undefined) data.tokensOut = msg.tokensOut
                    if (msg.analyzing !== undefined) data.analyzing = msg.analyzing
                    if (msg.regexes) {
                        for (const r of msg.regexes) {
                            if (!data.regexes.some((x: ICensorRegex) => x.pattern === r.pattern)) {
                                data.regexes.push(r)
                            }
                        }
                    }
                    ;(channelObject.config as ICensorConfig).selectedSessionId = msg.sessionId
                }
                else if (msg.kind === 'sessionstopped') {
                    if (data.connectedSessionId === msg.sessionId) {
                        data.connectedSessionId = null
                        data.connectedSessionDescription = null
                        const cfg = channelObject.config as ICensorConfig
                        if (cfg.selectedSessionId === msg.sessionId) cfg.selectedSessionId = null
                    }
                    if (msg.sessions !== undefined) data.sessions = msg.sessions
                }
                else if (msg.kind === 'sessiondisconnected') {
                    data.connectedSessionId = null
                    data.connectedSessionDescription = null
                    data.receivedLines = []
                    data.businessLines = []
                    data.llmInputLines = []
                    data.llmOutputLines = []
                    data.llmWarningLines = []
                    data.allTags = []
                    data.regexes = []
                    data.processedCount = 0
                    data.llmCount = 0
                    data.tokensIn = 0
                    data.tokensOut = 0
                    data.pendingCount = 0
                    data.analyzing = false
                    ;(channelObject.config as ICensorConfig).selectedSessionId = null
                }
                return { action: EChannelRefreshAction.REFRESH }

            case EInstanceMessageType.SIGNAL:
                const signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    if (signalMessage.instance) {
                        channelObject.instanceId = signalMessage.instance
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
        const config: ICensorConfig = channelObject.config
        data.receivedLines = []
        data.businessLines = []
        data.llmInputLines = []
        data.llmOutputLines = []
        data.llmWarningLines = []
        data.allTags = []
        data.regexes = []
        data.assets = []
        data.processedCount = 0
        data.llmCount = 0
        data.tokensIn = 0
        data.tokensOut = 0
        data.paused = false
        data.started = true
        data.sessions = []
        data.connectedSessionId = null
        data.connectedSessionDescription = null
        data.pendingSessionId = config.selectedSessionId
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
