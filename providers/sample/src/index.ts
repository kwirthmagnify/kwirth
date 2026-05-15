import { KwirthData } from '@kwirthmagnify/kwirth-common-back'
import { IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

export interface ISampleEvent {
    timestamp: number
    message: string
}

export class SampleProvider implements IProvider {
    public readonly id = 'sample'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers: Map<IProviderSubscriber, any> = new Map()
    private interval: ReturnType<typeof setInterval> | undefined

    constructor(_clusterInfo: any, _kwirthData: KwirthData) {}

    addSubscriber = async (c: IProviderSubscriber, data: any) => {
        this.subscribers.set(c, data ?? {})
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
    }

    startProvider = async () => {
        this.interval = setInterval(() => {
            const event: ISampleEvent = { timestamp: Date.now(), message: 'sample heartbeat' }
            for (const channel of this.subscribers.keys()) {
                channel.processProviderEvent(this.id, event)
            }
        }, 10000)
    }

    stopProvider = async () => {
        clearInterval(this.interval)
    }
}

export default SampleProvider
