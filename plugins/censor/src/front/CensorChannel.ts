import { FC } from 'react'
import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope, ISignalMessage, ENotifyLevel, IChannelRequirements, IChannelMessageAction, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IContentProps, ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { CensorSetup, CensorIcon } from './CensorSetup'
import { CensorTabContent } from './CensorTabContent'
import { CensorConfig, ECensorCommand, ICensorConfig, ICensorInstanceConfig } from './CensorConfig'
import { CensorData, ICensorData, ICensorRegex, IRunnerData, ERegexOrigin } from './CensorData'
import { ICensorAssetInfo } from './CensorConfig'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'

const MAX_DISPLAY_LINES = 1000
const MAX_LLM_LINES = 100

interface ICensorMessage {
    msgtype: string
    type: EInstanceMessageType
    flow: EInstanceMessageFlow
    action: EInstanceMessageAction
    instance: string
    kind?: 'received' | 'business' | 'llminput' | 'llmoutput' | 'llmwarning' | 'llmerror' | 'regex' | 'status' | 'config' | 'providers' | 'analyzing' | 'stats' | 'regexstats' | 'assets' | 'tags'
    assets?: ICensorAssetInfo[]
    analyzing?: boolean
    text?: string
    lines?: { text: string, namespace: string, pod: string, container: string }[]
    namespace?: string
    pod?: string
    container?: string
    pattern?: string
    example?: string
    explanation?: string
    origin?: ERegexOrigin
    tags?: string[]
    processedCount?: number
    llmCount?: number
    tokensIn?: number
    tokensOut?: number
    pendingCount?: number
    subscriberCount?: number
    instanceConfig?: ICensorInstanceConfig
    configs?: ICensorInstanceConfig[]
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
    sessionDescription?: string
    regexes?: ICensorRegex[]
    inputLines?: string[]
    timestamp?: string
    runnerKey?: string
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
        const config: ICensorConfig = channelObject.config as ICensorConfig

        const ensureRunner = (rk: string): IRunnerData => {
            if (!data.runners.has(rk)) {
                data.runners.set(rk, {
                    analyzing: false, regexes: [], processedCount: 0, llmCount: 0, llmLinesCount: 0,
                    totalBytesProcessed: 0, tokensIn: 0, tokensOut: 0, pendingCount: 0,
                    llmWarningLines: [], llmInputLines: [], llmOutputLines: [],
                    llmErrorLines: [], allTags: []
                })
            }
            return data.runners.get(rk)!
        }

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
                else if (msg.kind === 'llminput' && msg.runnerKey) {
                    const newLines: string[] = Array.isArray((msg as any).lines) ? (msg as any).lines : (msg.text !== undefined ? [msg.text] : [])
                    const maxInput = config.maxLlmInputLines ?? MAX_LLM_LINES
                    if (newLines.length > 0) {
                        const rd = ensureRunner(msg.runnerKey)
                        rd.llmInputLines.push(newLines)
                        if (rd.llmInputLines.length > maxInput) rd.llmInputLines.splice(0, rd.llmInputLines.length - maxInput)
                    }
                }
                else if (msg.kind === 'llmoutput' && msg.text !== undefined && msg.runnerKey) {
                    const maxOutput = config.maxLlmOutputLines ?? MAX_LLM_LINES
                    const rd = ensureRunner(msg.runnerKey)
                    rd.llmOutputLines.push(msg.text)
                    if (rd.llmOutputLines.length > maxOutput) rd.llmOutputLines.splice(0, rd.llmOutputLines.length - maxOutput)
                }
                else if (msg.kind === 'llmwarning' && msg.text !== undefined && msg.runnerKey) {
                    const tags = msg.tags ?? []
                    const rd = ensureRunner(msg.runnerKey)
                    rd.llmWarningLines.push({ original: msg.text, explanation: msg.explanation ?? '', tags, runnerKey: msg.runnerKey })
                    if (rd.llmWarningLines.length > MAX_DISPLAY_LINES) rd.llmWarningLines.splice(0, rd.llmWarningLines.length - MAX_DISPLAY_LINES)
                    for (const tag of tags) { if (!rd.allTags.includes(tag)) rd.allTags.push(tag) }
                }
                else if (msg.kind === 'llmerror' && msg.text !== undefined && msg.runnerKey) {
                    const rd = ensureRunner(msg.runnerKey)
                    rd.llmErrorLines.push({ text: msg.text, timestamp: msg.timestamp ?? new Date().toISOString(), lines: msg.inputLines })
                    if (rd.llmErrorLines.length > MAX_DISPLAY_LINES) rd.llmErrorLines.splice(0, rd.llmErrorLines.length - MAX_DISPLAY_LINES)
                }
                else if (msg.kind === 'regex' && msg.pattern !== undefined && msg.runnerKey) {
                    const rd = ensureRunner(msg.runnerKey)
                    if (!rd.regexes.some((r: ICensorRegex) => r.pattern === msg.pattern)) {
                        rd.regexes.push({ pattern: msg.pattern!, example: msg.example ?? '', explanation: msg.explanation ?? '', matches: 1, origin: msg.origin ?? ERegexOrigin.HYBRID })
                    }
                }
                else if (msg.kind === 'stats' && msg.runnerKey) {
                    const rd = ensureRunner(msg.runnerKey)
                    if (msg.processedCount !== undefined) rd.processedCount = msg.processedCount
                    if (msg.llmCount !== undefined) rd.llmCount = msg.llmCount
                    if ((msg as any).llmLinesCount !== undefined) rd.llmLinesCount = (msg as any).llmLinesCount
                    if ((msg as any).totalBytesProcessed !== undefined) rd.totalBytesProcessed = (msg as any).totalBytesProcessed
                    if (msg.tokensIn !== undefined) rd.tokensIn = msg.tokensIn
                    if (msg.tokensOut !== undefined) rd.tokensOut = msg.tokensOut
                    if (msg.pendingCount !== undefined) rd.pendingCount = msg.pendingCount
                    if ((msg as any).currentBatchSize !== undefined) rd.currentBatchSize = (msg as any).currentBatchSize
                    if (msg.subscriberCount !== undefined) data.subscriberCount = msg.subscriberCount
                }
                else if (msg.kind === 'regexstats') {
                    if (Array.isArray((msg as any).regexMatches)) {
                        const target = msg.runnerKey ? ensureRunner(msg.runnerKey).regexes : []
                        for (const rm of (msg as any).regexMatches as { pattern: string; matches: number }[]) {
                            const rx = target.find((r: ICensorRegex) => r.pattern === rm.pattern)
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
                    if (msg.sessionDescription !== undefined) data.ephemeralSessionName = msg.sessionDescription ?? null
                }
                else if (msg.kind === 'providers') {
                    if (msg.providers !== undefined) data.providers = msg.providers
                    if (msg.providersAvailable !== undefined) data.providersAvailable = msg.providersAvailable
                }
                else if (msg.kind === 'analyzing' && msg.analyzing !== undefined && msg.runnerKey) {
                    const rd = ensureRunner(msg.runnerKey)
                    rd.analyzing = msg.analyzing
                }
                else if (msg.kind === 'assets' && msg.assets !== undefined) {
                    data.assets = msg.assets
                }
                else if (msg.kind === 'tags' && msg.tags !== undefined && msg.runnerKey) {
                    const rd = ensureRunner(msg.runnerKey)
                    for (const tag of msg.tags) { if (!rd.allTags.includes(tag)) rd.allTags.push(tag) }
                }
                return { action: EChannelRefreshAction.NONE }

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
        data.receivedLines = []
        data.businessLines = []
        data.assets = []
        data.paused = false
        data.started = true
        data.startTime = undefined
        data.runners = new Map()
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
