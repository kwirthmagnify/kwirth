import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorInstanceConfig, ICensorSession } from './CensorConfig'

export interface ICensorLine {
    text: string
    namespace: string
    pod: string
    container: string
    timestamp?: string
}

export interface ICensorAsset {
    namespace: string
    pod: string
    container: string
}

export interface ICensorRegex {
    pattern: string
    example: string
    explanation: string
    matches: number
}

export interface ICensorWarning {
    original: string
    explanation: string
    tags: string[]
}

export interface ICensorData {
    uiState?: ICensorUiState
    receivedLines: ICensorLine[]
    businessLines: ICensorLine[]
    llmInputLines: string[][]
    llmOutputLines: string[]
    llmWarningLines: ICensorWarning[]
    llmErrorLines: { text: string, timestamp: string, lines?: string[] }[]
    allTags: string[]
    regexes: ICensorRegex[]
    assets: ICensorAsset[]
    processedCount: number
    llmCount: number
    llmLinesCount: number
    totalBytesProcessed: number
    pendingCount: number
    subscriberCount: number
    currentBatchSize?: number
    tokensIn: number
    tokensOut: number
    paused: boolean
    started: boolean
    startTime?: number
    stopTime?: number
    analyzing: boolean
    llms: ILlm[]
    providers: ILlmProvider[]
    providersAvailable: string[]
    instanceConfig: ICensorInstanceConfig
    configs: ICensorInstanceConfig[]
    sessions: ICensorSession[]
    connectedSessionId: string | null
    connectedSessionDescription: string | null
    pendingSessionId: string | null | undefined
}

export interface ICensorUiState {
    tab: number
    regexSort: 'asc' | 'desc' | 'none'
    autoScrolls: { regex: boolean, received: boolean, business: boolean, llmInput: boolean, llmOutput: boolean, warning: boolean, llmError: boolean }
}

export class CensorData implements ICensorData {
    receivedLines: ICensorLine[] = []
    businessLines: ICensorLine[] = []
    llmInputLines: string[][] = []
    llmOutputLines: string[] = []
    llmWarningLines: ICensorWarning[] = []
    llmErrorLines: { text: string, timestamp: string, lines?: string[] }[] = []
    allTags: string[] = []
    regexes: ICensorRegex[] = []
    assets: ICensorAsset[] = []
    processedCount = 0
    llmCount = 0
    llmLinesCount = 0
    totalBytesProcessed = 0
    pendingCount = 0
    subscriberCount = 0
    tokensIn = 0
    tokensOut = 0
    paused = false
    started = false
    startTime?: number
    analyzing = false
    llms: ILlm[] = []
    providers: ILlmProvider[] = []
    providersAvailable: string[] = []
    instanceConfig: ICensorInstanceConfig = { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":["example regex"]}', temperature: 0.2, active: false }
    configs: ICensorInstanceConfig[] = []
    sessions: ICensorSession[] = []
    connectedSessionId: string | null = null
    connectedSessionDescription: string | null = null
    pendingSessionId: string | null | undefined = undefined
}
