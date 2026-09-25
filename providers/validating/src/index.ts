import { IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import express, { Request, Response } from 'express'

interface IValidatingSubscriber {
    kinds: string[]
}

/*
    What the core lends the provider to write its log with. Declared here structurally instead of
    imported from kwirth-common-back, so this provider does not depend on a particular version of
    that package. Once the contract is published this interface can go.
*/
interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

export class ValidatingProvider implements IProvider {
    /*
        Starts writing to the console — what it did before — and the core replaces it as soon as the
        provider is built. With an older core nobody calls setLogger and everything stays as it was.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[validating] ${message}`),
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
        Lo que este provider sabe de si mismo: cuantos consumidores tiene AHORA. El contrato
        (IProvider.getStats, opcional desde kwirth-common-back 0.5.50) pide que sea BARATO — se devuelve
        lo que ya se tiene, no se calcula —, y de aqui sale que kwirth pueda decir si esto esta siendo
        consumido o emitiendo para nadie.
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
