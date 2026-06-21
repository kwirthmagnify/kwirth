import { IMircInstanceConfig } from './MircTypes'

export interface IMircConfig {
    showOffline: boolean
}

export class MircConfig implements IMircConfig {
    showOffline = true
}

export class MircInstanceConfig implements IMircInstanceConfig {
    nick = ''
}
