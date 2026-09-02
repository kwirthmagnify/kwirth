export enum ERegexOrigin {
    LLM = 'llm',
    MANUAL = 'manual',
    HYBRID = 'hybrid'
}

export enum ECensorCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    CONFIGSAVE = 'configsave',
    CONFIGDELETE = 'configdelete',
    PROVIDERSAVAILABLE = 'providersavailable',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete',
    REGEXADD = 'regexadd'
}

export interface ICensorBusinessSource {
    space?: string
    type?: string
    businessPath?: string
    addTimestamp?: boolean
}

export interface ICensorLogstreamSource {
    namespace?: string
    labelSelector?: string
    podRegex?: string
}

export interface ICensorInstanceConfig {
    name: string
    version: string
    llmId: string
    system: string
    batchSize: number
    batchMode?: 'fixed' | 'auto'
    batchSizeMin?: number
    exampleJson: string
    temperature: number
    active?: boolean
    scope?: 'cluster' | 'resource'
    businessSources?: ICensorBusinessSource[]
    logstreamEnabled?: boolean
    logstreamAll?: boolean
    logstreamSources?: ICensorLogstreamSource[]
    senderId?: string
    senderConfigName?: string
    mode?: 'inference' | 'audit'
    maxLineLength?: number
    batchTimeout?: number
    // legacy single-source fields (kept for backwards compat)
    space?: string
    type?: string
    addTimestamp?: boolean
    businessPath?: string
}

// Estado del stream de logs de un asset. El inventario de assets (qué containers casan con las
// configs activas) es independiente del stream: el stream solo se abre mientras se analiza.
export enum ECensorAssetState {
    IDLE = 'idle',
    STREAMING = 'streaming',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed'
}

export interface ICensorAssetInfo {
    namespace: string
    pod: string
    container: string
    state: ECensorAssetState
}
