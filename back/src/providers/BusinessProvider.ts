import { LoginApi } from '../api/LoginApi'
import { IChannel } from '../channels/IChannel'
import { ClusterInfo } from '../model/ClusterInfo'
import { ELogComponent, logInfo } from '../tools/Logging'
import { IProvider } from './IProvider'
import express, { Request, Response} from 'express'

interface IBusinessDataConfig {
    spaces: string[]
    types: string[]
}

export class BusinessProvider implements IProvider {
    public readonly id = 'businessevent'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'business-data'

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IBusinessDataConfig>

    constructor(clusterInfo: ClusterInfo) {
        logInfo(ELogComponent.PROVIDER, `Instantiating provider ${this.id}`)
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()

        this.router.route('/')
            .post( async (req:Request, res:Response) => {
                try {
                    if (req.body && req.body.space && req.body.type) {
                        /*
                            expected format is 
                                {
                                    space: string
                                    type: string
                                    data: any
                                }
                            so subscribers can subscribe to a list of spaces and/or types
                        */
                        console.log(req.body)
                        console.log(this.subscribers)
                        for (let [sub, config] of this.subscribers) {
                            console.log(sub.channelId)
                            if (config.spaces.includes(req.body.space) && (req.body.type==='' || (req.body.type!=='' && config.types.includes(req.body.type)))) {
                                sub.processProviderEvent(this.id, {
                                    type: 'event',
                                    timestamp: Date.now(),
                                    event: req.body
                                })
                            }
                        }
                        res.status(200).json()
                    }
                    else {
                        res.status(400).json()
                    }
                }
                catch (err) {
                    res.status(500).send()
                    console.log('Error managing business event')
                    console.log(err)
                }
            })
    }

    addSubscriber = async (c: IChannel, config:{spaces:string[], types:string[]}) => {
        console.log('**************ADDSUBS')
        let data:IBusinessDataConfig = {
            spaces: config.spaces,
            types: config.types
        }
        this.subscribers.set(c, data)
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) this.subscribers.delete(c)
    }

    startProvider = async () => {
    }

    stopProvider = async () => {
    }
}