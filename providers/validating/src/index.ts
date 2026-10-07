import { IExtensionLogger, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import express, { Request, Response } from 'express'

interface IValidatingSubscriber {
    kinds: string[]
}

export class ValidatingProvider implements IProvider {
    /*
        Starts writing to the console — what it did before — and the core replaces it as soon as the
        provider is built. With an older core nobody calls setLogger and everything stays as it was.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[validating] ${message}`),
        trace: (message: unknown) => console.log(`[validating] ${message}`),
        warning: (message: unknown) => console.warn(`[validating] ${message}`),
        error: (message: unknown) => console.error(`[validating] ${message}`)
    }
    setLogger = (logger: IExtensionLogger): void => { this.log = logger }
    public readonly id = 'validating'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'validating'
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers: Map<IProviderSubscriber, IValidatingSubscriber> = new Map()

    /*
        What this provider knows about itself: how many consumers it has RIGHT NOW. The contract
        (IProvider.getStats, optional since kwirth-common-back 0.5.50) asks for it to be CHEAP — what is
        already held is returned, nothing is computed — and it is what lets kwirth say whether this is
        being consumed or emitting for nobody.
    */
    getStats = () => ({ subscribers: this.subscribers.size })


    constructor(_clusterInfo: unknown, _kwirthData: unknown) {
        this.router.route('/validate')
            .post(async (_req: Request, res: Response) => {
                try {
                    res.status(200).json({})
                } catch (err) {
                    this.log.error(`Error in /validate: ${err}`)
                    res.status(400).send()
                }
            })
    }

    addSubscriber = async (c: IProviderSubscriber, data: { kinds: string[] }) => {
        this.subscribers.set(c, { kinds: data.kinds })
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
    }

    startProvider = async () => {}
    stopProvider  = async () => {}
}

export default ValidatingProvider
