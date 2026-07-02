import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorInstanceConfig, ERegexOrigin } from './CensorConfig'

export { ERegexOrigin }

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
    origin: ERegexOrigin
}

export interface ICensorWarning {
    original: string
    explanation: string
    tags: string[]
    runnerKey: string
}

export interface IRunnerData {
    analyzing: boolean
    regexes: ICensorRegex[]
    processedCount: number
    llmCount: number
    llmLinesCount: number
    totalBytesProcessed: number
    tokensIn: number
    tokensOut: number
    pendingCount: number
    currentBatchSize?: number
    llmWarningLines: ICensorWarning[]
    llmInputLines: string[][]
    llmOutputLines: string[]
    llmErrorLines: { text: string, timestamp: string, lines?: string[] }[]
    allTags: string[]
}

export interface ICensorData {
    uiState?: ICensorUiState
    receivedLines: ICensorLine[]
    businessLines: ICensorLine[]
    assets: ICensorAsset[]
    subscriberCount: number
    paused: boolean
    started: boolean
    startTime?: number
    stopTime?: number
    llms: ILlm[]
    providers: ILlmProvider[]
    providersAvailable: string[]
    instanceConfig: ICensorInstanceConfig
    configs: ICensorInstanceConfig[]
    ephemeralSessionName: string | null
    runners: Map<string, IRunnerData>
}

// Tab IDs decoupled from render position (never use positional indices for MUI Tabs)
export enum ECensorTab {
    Objects = 'objects',
    Regex = 'regex',
    Logstream = 'logstream',
    Business = 'business',
    LlmInput = 'llmInput',
    LlmResponses = 'llmResponses',
    Issues = 'issues',
    LlmErrors = 'llmErrors',
    Performance = 'performance'
}

export interface ICensorUiState {
    tab: ECensorTab
    regexSort: 'asc' | 'desc' | 'none'
    autoScrolls: { regex: boolean, received: boolean, business: boolean, llmInput: boolean, llmOutput: boolean, warning: boolean, llmError: boolean }
}

export class CensorData implements ICensorData {
    receivedLines: ICensorLine[] = []
    businessLines: ICensorLine[] = []
    assets: ICensorAsset[] = []
    subscriberCount = 0
    paused = false
    started = false
    startTime?: number
    llms: ILlm[] = []
    providers: ILlmProvider[] = []
    providersAvailable: string[] = []
    instanceConfig: ICensorInstanceConfig = { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":["example regex"]}', temperature: 0.2, active: false }
    configs: ICensorInstanceConfig[] = []
    ephemeralSessionName: string | null = null
    runners: Map<string, IRunnerData> = new Map()
}
