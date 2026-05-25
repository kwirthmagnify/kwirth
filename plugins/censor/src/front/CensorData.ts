import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorInstanceConfig } from './CensorConfig'

export interface ICensorLine {
    text: string
    namespace: string
    pod: string
    container: string
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
}

export interface ICensorWarning {
    original: string
    explanation: string
    tags: string[]
}

export interface ICensorData {
    receivedLines: ICensorLine[]
    llmInputLines: string[]
    llmOutputLines: string[]
    llmWarningLines: ICensorWarning[]
    allTags: string[]
    regexes: ICensorRegex[]
    assets: ICensorAsset[]
    processedCount: number
    llmCount: number
    paused: boolean
    started: boolean
    analyzing: boolean
    llms: ILlm[]
    providers: ILlmProvider[]
    providersAvailable: string[]
    instanceConfig: ICensorInstanceConfig
    configs: ICensorInstanceConfig[]
}

export class CensorData implements ICensorData {
    receivedLines: ICensorLine[] = []
    llmInputLines: string[] = []
    llmOutputLines: string[] = []
    llmWarningLines: ICensorWarning[] = []
    allTags: string[] = []
    regexes: ICensorRegex[] = []
    assets: ICensorAsset[] = []
    processedCount = 0
    llmCount = 0
    paused = false
    started = false
    analyzing = false
    llms: ILlm[] = []
    providers: ILlmProvider[] = []
    providersAvailable: string[] = []
    instanceConfig: ICensorInstanceConfig = { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":["example regex"]}', temperature: 0.2, active: false }
    configs: ICensorInstanceConfig[] = []
}
