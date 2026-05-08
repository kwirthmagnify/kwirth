import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IProvider } from '../IProvider'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logError, logInfo, logTrace } from '../../tools/Logging'
import express, { Request, Response} from 'express'
import { ApiKeyApi } from '../../api/ApiKeyApi'

interface IBusinessDataConfig {
    spaces: { 
        name:string,
        types: string[]
    }[]
}

export class BusinessProvider implements IProvider {
    public readonly id = 'business'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'business'
    readonly requiresApiKeyApi: boolean = false
    public apiKeyApi: ApiKeyApi|undefined

    private data = new Map<string, Map<string,any[]>>()

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IBusinessDataConfig>

    constructor(clusterInfo: ClusterInfo, kwirthData: KwirthData, apiKeyApi?: ApiKeyApi) {
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
                        // store new data
                        // +++clean array according to max size
                        let space = this.data.get(req.body.space)
                        if (space) {
                            let type = space.get(req.body.type)
                            if (type)
                                type.push(req.body)
                            else
                                space.set(req.body.type, [req.body])
                        }
                        else {
                            this.data.set(req.body.space, new Map())
                            this.data.get(req.body.space)?.set(req.body.type, [req.body])
                        }
                        for (let [subscriber, config] of this.subscribers) {
                            let space=config.spaces.find(s => s.name === req.body.space)
                            if (space) {
                                if (req.body.type==='' || (req.body.type!=='' && space.types.includes(req.body.type))) {
                                    subscriber.processProviderEvent(this.id, {
                                        last: {
                                            type: 'event',
                                            timestamp: Date.now().toString(),
                                            event: req.body
                                        },
                                        all: this.data
                                    })
                                }
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
                    logError(ELogComponent.PROVIDER, 'Error managing business event')
                    logError(ELogComponent.PROVIDER, err)
                }
            })
    }

    addSubscriber = async (c: IChannel, config:IBusinessDataConfig) => {
        let data:IBusinessDataConfig = {
            spaces: config.spaces
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