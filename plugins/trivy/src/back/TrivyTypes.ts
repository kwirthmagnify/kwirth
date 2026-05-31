export interface IUnknown {
    name: string
    namespace: string
    container: string
    statusCode: number
    statusMessage: string
}

export interface IKnown {
    name: string
    namespace: string
    container: string
    report: any
}

export { ETrivyCommand, ITrivyMessage, ITrivyMessageResponse, ITrivyConfig, ITrivyInstanceConfig } from '../common/TrivyTypes'
