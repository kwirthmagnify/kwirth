export enum ECensorCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    CONFIGSAVE = 'configsave',
    CONFIGDELETE = 'configdelete',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete',
    PROVIDERSSET = 'providersset',
    SESSIONLIST = 'sessionlist',
    SESSIONSTART = 'sessionstart',
    SESSIONSTOP = 'sessionstop',
    SESSIONCONNECT = 'sessionconnect',
    SESSIONDISCONNECT = 'sessiondisconnect'
}

export interface ICensorSession {
    id: string
    description: string
    namespace: string
    group?: string
    pod?: string
    container?: string
    createdAt?: string
}

export interface ICensorConfig {
    maxLines: number
    selectedSessionId?: string | null
}

export class CensorConfig implements ICensorConfig {
    maxLines = 1000
    selectedSessionId: string | null | undefined = undefined
}

export interface ICensorInstanceConfig {
    name: string
    version: string
    llmId: string
    system: string
    batchSize: number
    exampleJson: string
    temperature: number
    active?: boolean
    space?: string
    type?: string
    addTimestamp?: boolean
    businessPath?: string
    senderId?: string
    senderConfigName?: string
}

export class CensorInstanceConfig implements ICensorInstanceConfig {
    name = ''
    version = '1'
    llmId = ''
    system = ''
    batchSize = 50
    exampleJson = '{"patterns":["example regex"]}'
    temperature = 0.2
    active = false
    space = ''
    type = ''
    addTimestamp = false
    businessPath = ''
    senderId = ''
    senderConfigName = ''
}
