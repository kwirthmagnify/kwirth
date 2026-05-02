import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IProvider } from '../IProvider'
import { ClusterInfo, INodeInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from '../../tools/Logging'
import express, { Request, Response} from 'express'

interface IValidatingSubscriber {
    kinds: string[]
}

export class ValidatingProvider implements IProvider {
    public readonly id = 'validating'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = undefined

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IValidatingSubscriber>
    
    constructor(clusterInfo: ClusterInfo, kwirthData:KwirthData) {
        logInfo(ELogComponent.PROVIDER, `Instantiating provider ${this.id}`)
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()

        this.router.route('/validate')
            .post( async (req:Request, res:Response) => {
                try {
                    res.status(200).json()
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error updating metrics settings')
                    console.log(err)
                }
            })

    }

    addSubscriber = async (c: IChannel, data: {kinds:string[]}) => {
        let subscriber: IValidatingSubscriber = {
            kinds: data.kinds
        }
        this.subscribers.set(c, subscriber)
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) this.subscribers.delete(c)
    }

    startProvider = async () => {       
    }

    stopProvider = async () => {
    }

}