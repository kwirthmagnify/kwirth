import type { ICensorInstanceConfig } from '../common/CensorTypes'
export { ECensorCommand, ERegexOrigin, ECensorAssetState, ICensorInstanceConfig, ICensorBusinessSource, ICensorLogstreamSource, ICensorAssetInfo } from '../common/CensorTypes'

export interface ICensorConfig {
    maxLines: number
    maxLlmInputLines?: number
    maxLlmOutputLines?: number
}

export class CensorConfig implements ICensorConfig {
    maxLines = 1000
    maxLlmInputLines = 100
    maxLlmOutputLines = 100
}

export class CensorInstanceConfig implements ICensorInstanceConfig {
    name = ''
    version = '1'
    llmId = ''
    system = ''
    batchSize = 10
    batchMode: 'fixed' | 'auto' = 'fixed'
    batchSizeMin = 5
    exampleJson = '{"patterns":["example regex"]}'
    temperature = 0.2
    active = false
    businessSources: import('../common/CensorTypes').ICensorBusinessSource[] = []
    senderId = ''
    senderConfigName = ''
    mode: 'inference' | 'audit' = 'inference'
    maxLineLength = 0
    batchTimeout = 2
}
