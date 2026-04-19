export interface IConfigProvider {
    name: string
    models: string[]
}

export interface IConfigKind {
    kind: string
    system: string
    prompt: string
    action: 'inform'|'cancel'|'repair'
    llm: string
}

export interface IConfigLlm {
    id: string
    provider: string
    model: string
    key: string
    data?: any
}

export interface IPinocchioConfig {
    providers: IConfigProvider[]
    kinds: IConfigKind[]
    llms: IConfigLlm[]
}

export class PinocchioConfig  implements IPinocchioConfig {
    providers: IConfigProvider[] = []
    kinds: IConfigKind[] = []
    llms: IConfigLlm[] = []
}

interface IPinocchioInstanceConfig {
}

class PinocchioInstanceConfig implements IPinocchioInstanceConfig{
}

export type { IPinocchioInstanceConfig }
export { PinocchioInstanceConfig }
