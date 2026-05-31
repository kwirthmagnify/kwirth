export { ECensorCommand, ICensorSession, ICensorInstanceConfig } from '../common/CensorTypes'

export interface ICensorConfig {
    maxLines: number
    selectedSessionId?: string | null
}

export class CensorConfig implements ICensorConfig {
    maxLines = 1000
    selectedSessionId: string | null | undefined = undefined
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
