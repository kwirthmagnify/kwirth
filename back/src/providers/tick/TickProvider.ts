import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IProvider } from '../IProvider'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logInfo } from '../../tools/Logging'
import { ApiKeyApi } from '../../api/ApiKeyApi'

export class TickProvider implements IProvider {
    public readonly id = 'tick'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    readonly requiresApiKeyApi: boolean = false
    public apiKeyApi: ApiKeyApi|undefined

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, any>
    private interval: NodeJS.Timeout | undefined

    constructor(clusterInfo: ClusterInfo, kwirthData: KwirthData) {
        logInfo(ELogComponent.PROVIDER, `Instantiating provider ${this.id}`)
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()
    }

    addSubscriber = async (c: IChannel) => {
        this.subscribers.set(c, {})
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) this.subscribers.delete(c)
    }

    startProvider = async () => {
        this.interval = setInterval( () => {
            this.subscribers.forEach(element => {
                for (let channel of this.subscribers.keys()) {
                    channel.processProviderEvent(this.id, true)
                }
            })
        }, 5000)
    }

    stopProvider = async () => {
        clearInterval(this.interval)
    }
}