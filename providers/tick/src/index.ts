import { IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

export class TickProvider implements IProvider {
    public readonly id = 'tick'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers: Map<IProviderSubscriber, any> = new Map()
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
                subscriber.processProviderEvent(this.id, true)
            }
        }, 5000)
    }

    stopProvider = async () => {
        clearInterval(this.interval)
    }
}

export default TickProvider
