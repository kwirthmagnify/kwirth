export enum ECensorCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete'
}

export interface ICensorConfig {
    maxLines: number
}

export class CensorConfig implements ICensorConfig {
    maxLines = 1000
}

export interface ICensorInstanceConfig {
    llmId: string
    system: string
    batchSize: number
    exampleJson: string
    temperature: number
}

export class CensorInstanceConfig implements ICensorInstanceConfig {
    llmId = ''
    system = ''
    batchSize = 50
    exampleJson = '{"patterns":["example regex"]}'
    temperature = 0.2
}
