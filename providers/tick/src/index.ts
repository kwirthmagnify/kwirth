import { IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

export class TickProvider implements IProvider {
    public readonly id = 'tick'
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
        Deliveries since startup: one per call to a subscriber. No filter: every tick goes to everybody.
    */
    private deliveries = 0

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    private interval: NodeJS.Timeout | undefined

    constructor(_clusterInfo: unknown, _kwirthData: unknown) {}

    addSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.set(c, {})
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
    }

    startProvider = async () => {
        this.interval = setInterval(() => {
            for (const subscriber of this.subscribers.keys()) {
                this.deliveries++
                subscriber.processProviderEvent(this.id, true)
            }
        }, 5000)
    }

    stopProvider = async () => {
        clearInterval(this.interval)
    }
}

export default TickProvider
