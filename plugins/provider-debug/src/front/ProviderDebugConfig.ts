import { IProviderDebugInstanceConfig } from '../common/ProviderDebugTypes'

export interface IProviderDebugConfig {
    maxEvents: number
}

export class ProviderDebugConfig implements IProviderDebugConfig {
    maxEvents = 200
}

export class ProviderDebugInstanceConfig implements IProviderDebugInstanceConfig {
    providerId = ''
    subscriptionData = ''
}
