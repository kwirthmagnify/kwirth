import express, { Request, Response } from 'express'
import { KwirthData, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

// ─── Tipos públicos de config (los consumen los channels que se suscriben) ──────

// Un espacio lógico al que se suscribe un channel: nombre + lista de tipos admitidos.
// Un evento solo se entrega si su 'type' está en 'types' (lista vacía = no se entrega nada de ese espacio).
interface IBusinessSpaceConfig {
    name: string
    types: string[]
}

/**
 * Config que pasa un channel al llamar a addSubscriber().
 * Agrupa los eventos por espacios lógicos (dominios de negocio).
 *
 * Ejemplo:
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

// ─── Tipos internos ─────────────────────────────────────────────────────────────

// Cuerpo esperado en el POST de ingesta.
interface IBusinessEventBody {
    space: string
    type: string
    data?: unknown
}

/**
 * Evento que el provider entrega a cada subscriber.
 * Mismo shape que consumen censor/pinocchio/montag (cada uno lo castea a su tipo).
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

    // almacén acumulado: espacio -> tipo -> eventos
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
        Procesa un evento entrante: lo acumula en el store y hace fan-out a los subscribers
        interesados en ese espacio/tipo. Devuelve false si el body es inválido (falta space o type).
        Formato esperado: { space: string, type: string, data: unknown }
    */
    ingest = (body: IBusinessEventBody | undefined): boolean => {
        if (!body || !body.space || !body.type) return false

        // almacena el nuevo evento
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

        // fan-out a los subscribers interesados en ese espacio/tipo
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
