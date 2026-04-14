import { IChannel } from '../channels/IChannel'
import { ClusterInfo } from '../model/ClusterInfo'
import { IProvider } from './IProvider'
import express, { Request, Response} from 'express'

interface IBusinessDataConfig {
    events: boolean
    schedule: boolean
    timeout: NodeJS.Timeout|undefined
}

export class BusinessEventProvider implements IProvider {
    public readonly id = 'businessevent'
    public readonly providesRouter = true
    public router = express.Router()
    private lastEvent: any = undefined

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IBusinessDataConfig>

    constructor(clusterInfo: ClusterInfo) {
        console.log(`Instantiating provider ${this.id}`)
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()

        this.router.route('/event')
            .post( async (req:Request, res:Response) => {
                try {
                    for (let [sub, config] of this.subscribers) {
                        if (config.events) {
                            sub.processProviderEvent(this.id, {
                                type: 'event',
                                timestamp: Date.now(),
                                event: req.body.event
                            })
                            this.lastEvent = req.body.event
                        }
                    }
                    res.status(200).json()
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error managing business event')
                    console.log(err)
                }
            })
    }

    addSubscriber = async (c: IChannel, config:{events:boolean, schedule: boolean, interval: number}) => {
        let data:IBusinessDataConfig = {
            timeout: undefined,
            events: config.events,
            schedule: config.schedule
        }
        if (config.schedule) {
            data.timeout = setInterval(() => {
                if (!this.lastEvent) return
                for (let subs of this.subscribers.keys()) {
                    subs.processProviderEvent(this.id, {
                        type: 'schedule',
                        timestamp: Date.now(),
                        event: this.lastEvent
                    })
                }
            }, config.interval)
        }
        this.subscribers.set(c, data)
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) {
            if (this.subscribers.get(c)?.schedule) clearInterval(this.subscribers.get(c)!.timeout)
            this.subscribers.delete(c)
        }
    }

    startProvider = async () => {
        // nothing to do, data is received via HTTP
        // intervals get started as subscribers adhere
    }

    stopProvider = async () => {
        for (let [sub, config] of this.subscribers) {
            if (config.schedule) clearInterval(config.timeout)
        }
    }
}