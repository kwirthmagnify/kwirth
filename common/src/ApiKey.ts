import { AccessKey } from './AccessKey'

export interface ApiKey {
    accessKey: AccessKey
    description: string
    expire: number
    days: number
    enabledChannels?: string[]
}

