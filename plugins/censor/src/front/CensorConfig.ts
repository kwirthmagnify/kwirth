export enum ECensorCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    CONFIGSAVE = 'configsave',
    CONFIGDELETE = 'configdelete',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete',
    PROVIDERSSET = 'providersset'
}

export interface ICensorConfig {
    maxLines: number
}

export class CensorConfig implements ICensorConfig {
    maxLines = 1000
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
}
