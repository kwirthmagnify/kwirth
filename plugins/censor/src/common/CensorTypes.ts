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

export interface ICensorBusinessSource {
    space?: string
    type?: string
    businessPath?: string
    addTimestamp?: boolean
}

export interface ICensorSyslogSource {
    sourceIp?: string
    hostname?: string
    appName?: string
    severity?: number
    filter?: string
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
    syslogSources?: ICensorSyslogSource[]
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
