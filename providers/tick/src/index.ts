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
        Lo que este provider sabe de si mismo: cuantos consumidores tiene AHORA. El contrato
        (IProvider.getStats, opcional desde kwirth-common-back 0.5.50) pide que sea BARATO — se devuelve
        lo que ya se tiene, no se calcula —, y de aqui sale que kwirth pueda decir si esto esta siendo
        consumido o emitiendo para nadie.
    */
    /*
        Entregas desde que arranco: una por llamada a un suscriptor. Sin filtro: cada tick va a todos.
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
