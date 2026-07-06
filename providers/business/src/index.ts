import express, { Request, Response } from 'express'
import { KwirthData, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

// ─── Public config types (consumed by the channels that subscribe) ──────────────

// A logical space a channel subscribes to: name + list of accepted types.
// An event is delivered only if its 'type' is in 'types' (empty list = nothing delivered for that space).
interface IBusinessSpaceConfig {
    name: string
    types: string[]
}

/**
 * Config passed by a channel when calling addSubscriber().
 * Groups events by logical spaces (business domains).
 *
 * Example:
 *   {
 *     spaces: [
 *       { name: 'orders',   types: ['created', 'shipped'] },
 *       { name: 'payments', types: ['authorized', 'refunded'] }
 *     ]
 *   }
 */
export interface IBusinessProviderConfig {
    spaces: IBusinessSpaceConfig[]
}

// ─── Internal types ─────────────────────────────────────────────────────────────

// Body expected in the ingestion POST.
interface IBusinessEventBody {
    space: string
    type: string
    data?: unknown
}

/**
 * Event delivered by the provider to each subscriber.
 * Same shape consumed by censor/pinocchio/montag (each casts it to its own type).
 */
export interface IBusinessProviderEvent {
    last: {
        type: string
        timestamp: string
        event: unknown
    }
    all: Map<string, Map<string, unknown[]>>
}

// ─── Provider ────────────────────────────────────────────────────────────────────

export class BusinessProvider implements IProvider {
    public readonly id = 'business'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'business'
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    // accumulated store: space -> type -> events
    private data = new Map<string, Map<string, unknown[]>>()
    private subscribers = new Map<IProviderSubscriber, IBusinessProviderConfig>()

    constructor(_clusterInfo: any, _kwirthData: KwirthData) {
        console.log(`[business] Instantiating provider ${this.id}`)

        this.router.route('/')
            .post(async (req: Request, res: Response) => {
                try {
                    res.status(this.ingest(req.body as IBusinessEventBody | undefined) ? 200 : 400).json()
                }
                catch (err) {
                    res.status(500).send()
                    console.error('[business] Error managing business event:', err)
                }
            })
    }

    /*
        Processes an incoming event: accumulates it in the store and fans it out to the subscribers
        interested in that space/type. Returns false if the body is invalid (missing space or type).
        Expected format: { space: string, type: string, data: unknown }
    */
    ingest = (body: IBusinessEventBody | undefined): boolean => {
        if (!body || !body.space || !body.type) return false

        // store the new event
        const space = this.data.get(body.space)
        if (space) {
            const type = space.get(body.type)
            if (type)
                type.push(body)
            else
                space.set(body.type, [body])
        }
        else {
            const newSpace = new Map<string, unknown[]>()
            newSpace.set(body.type, [body])
            this.data.set(body.space, newSpace)
        }

        // fan-out to subscribers interested in that space/type
        for (const [subscriber, config] of this.subscribers) {
            const subSpace = config.spaces.find(s => s.name === body.space)
            if (subSpace && subSpace.types.includes(body.type)) {
                subscriber.processProviderEvent(this.id, {
                    last: {
                        type: 'event',
                        timestamp: Date.now().toString(),
                        event: body
                    },
                    all: this.data
                })
            }
        }
        return true
    }

    addSubscriber = async (c: IProviderSubscriber, config: IBusinessProviderConfig) => {
        this.subscribers.set(c, { spaces: config?.spaces ?? [] })
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
    }

    startProvider = async () => {}

    stopProvider = async () => {
        this.subscribers.clear()
        this.data.clear()
    }
}

export default BusinessProvider
