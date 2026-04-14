import { IChannel } from '../channels/IChannel'
import { ClusterInfo } from '../model/ClusterInfo'
import { IProvider } from './IProvider'

export class TickProvider implements IProvider {
    public readonly id = 'tick'
    public readonly providesRouter = false
    public router = undefined

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, any>
    private interval: NodeJS.Timeout | undefined

    constructor(clusterInfo: ClusterInfo) {
        console.log(`Instantiating provider ${this.id}`)
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