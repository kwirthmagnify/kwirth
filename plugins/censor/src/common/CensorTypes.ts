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
    mode?: 'inference' | 'audit'
    maxLineLength?: number
}
