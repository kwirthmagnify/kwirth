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

    /*
        What this provider knows about itself: how many consumers it has RIGHT NOW. The contract
        (IProvider.getStats, optional since kwirth-common-back 0.5.50) asks for it to be CHEAP — what is
        already held is returned, nothing is computed — and it is what lets kwirth say whether this is
        being consumed or emitting for nobody.
    */
    /*
        Deliveries since startup: one per call to a subscriber. No filter: every heartbeat goes to everybody.
    */
    private deliveries = 0

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

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
                this.deliveries++
                channel.processProviderEvent(this.id, event)
            }
        }, 10000)
    }

    stopProvider = async () => {
        clearInterval(this.interval)
    }
}

export default SampleProvider
