import express, { Request, Response } from 'express'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IdpManager } from '../tools/idp/IdpManager'
import { IIdpInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import { ELogComponent, logError } from '../tools/Logging'

const SECRET_MASK = '********'

/*
    Gestion (admin) de conectores e instancias de IdP. Montado en /idp bajo la running instance,
    protegido por validKey (igual que UserApi/ApiKeyApi; el front oculta el menu a no-admin).
    Los campos 'password' del schema se ENMASCARAN al salir y, al guardar, si llegan enmascarados
    se conserva el valor almacenado (patron de campo secreto de solo-escritura).
    El install de conectores (tgz) es EPIC G.
*/
export class IdpApi {
    public router = express.Router()
    private idpManager: IdpManager

    constructor(idpManager: IdpManager, apiKeyApi: ApiKeyApi) {
        this.idpManager = idpManager

        this.router.use(async (req: Request, res: Response, next) => {
            if (!(await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            next()
        })

        // tipos de conector disponibles (bundled/dev/instalados)
        this.router.get('/connectors', (_req: Request, res: Response) => {
            res.status(200).json(this.idpManager.listConnectors())
        })

        // export / import de la config completa (admin)
        this.router.get('/export', async (_req: Request, res: Response) => {
            res.status(200).json(await this.idpManager.exportConfig())
        })
        this.router.post('/import', async (req: Request, res: Response) => {
            try {
                await this.idpManager.importConfig(req.body || {})
                res.status(200).json({})
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error importing IdP config: ${err}`)
                res.status(500).json({})
            }
        })

        // listar instancias (enmascaradas)
        this.router.get('/', async (_req: Request, res: Response) => {
            const instances = await this.idpManager.listInstances()
            res.status(200).json(instances.map(i => this.mask(i)))
        })

        // obtener una instancia (enmascarada)
        this.router.get('/:id', async (req: Request, res: Response) => {
            const inst = await this.idpManager.getInstance(req.params.id)
            if (!inst) {
                res.status(404).json({})
                return
            }
            res.status(200).json(this.mask(inst))
        })

        // crear / actualizar
        this.router.post('/', (req: Request, res: Response) => this.save(req, res))
        this.router.put('/:id', (req: Request, res: Response) => this.save(req, res, req.params.id))

        // borrar
        this.router.delete('/:id', async (req: Request, res: Response) => {
            await this.idpManager.deleteInstance(req.params.id)
            res.status(200).json({})
        })
    }

    private passwordFields(connectorId: string): string[] {
        const schema = this.idpManager.getConnectorSchema(connectorId) ?? []
        return schema.filter(f => f.type === 'password').map(f => f.name)
    }

    // devuelve una copia con los campos password enmascarados (si tienen valor)
    private mask(inst: IIdpInstanceConfig): IIdpInstanceConfig {
        const fields = this.passwordFields(inst.connectorId)
        const config: Record<string, unknown> = { ...inst.config }
        for (const f of fields) {
            if (config[f] !== undefined && config[f] !== '') config[f] = SECRET_MASK
        }
        return { ...inst, config }
    }

    private async save(req: Request, res: Response, idOverride?: string): Promise<void> {
        try {
            const incoming = req.body as IIdpInstanceConfig
            if (idOverride) incoming.id = idOverride
            if (!incoming || !incoming.id || !incoming.connectorId) {
                res.status(400).json({ error: 'id and connectorId are required' })
                return
            }
            // merge de secretos: si un campo password llega enmascarado, conservar el almacenado
            const existing = await this.idpManager.getInstance(incoming.id)
            const fields = this.passwordFields(incoming.connectorId)
            const config: Record<string, unknown> = { ...(incoming.config || {}) }
            for (const f of fields) {
                if (config[f] === SECRET_MASK) config[f] = existing?.config?.[f] ?? ''
            }
            incoming.config = config
            await this.idpManager.saveInstance(incoming)
            res.status(200).json(this.mask(incoming))
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Error saving IdP instance: ${err}`)
            res.status(500).json({})
        }
    }
}
