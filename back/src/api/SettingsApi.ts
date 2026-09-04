import express, { Request, Response} from 'express'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IConfigMaps } from '../tools/IConfigMap'
import { ELogComponent, logError } from '../tools/Logging'

const SETTINGS_KEY = 'kwirth.settings'
const DEFAULT_METRICS_INTERVAL = 15

// Configuracion del propio Kwirth (no del usuario, que va en /store/:user/settings/general).
// Todos los campos son opcionales: unos settings guardados antes de que existiera un campo no lo
// tendran, y quien lo consume resuelve el valor efectivo con su propia precedencia.
export interface IKwirthSettings {
    metricsInterval?: number
}

export class SettingsApi {
    public router = express.Router()
    private configMaps: IConfigMaps
    private apiKeyApi: ApiKeyApi
    private onSettingsChanged?: (settings: IKwirthSettings) => void

    private constructor(configMaps: IConfigMaps, apiKeyApi: ApiKeyApi, onSettingsChanged?: (settings: IKwirthSettings) => void) {
        this.configMaps = configMaps
        this.apiKeyApi = apiKeyApi
        this.onSettingsChanged = onSettingsChanged
        this.initializeRoutes()
    }

    public static async create(configMaps: IConfigMaps, apiKeyApi: ApiKeyApi, onSettingsChanged?: (settings: IKwirthSettings) => void): Promise<SettingsApi|undefined> {
        try {
            return new SettingsApi(configMaps, apiKeyApi, onSettingsChanged)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not create settings api: ${err}`)
        }
        return undefined
    }

    // Lectura sin router, para que el arranque pueda hidratar antes de que existan rutas.
    public static async read(configMaps: IConfigMaps): Promise<IKwirthSettings> {
        return (await configMaps.read(SETTINGS_KEY, {})) as IKwirthSettings ?? {}
    }

    // Valor efectivo del intervalo de metricas: lo guardado gana, luego METRICSINTERVAL, luego el default.
    public static resolveMetricsInterval(settings: IKwirthSettings): number {
        if (settings.metricsInterval && settings.metricsInterval > 0) return settings.metricsInterval
        const fromEnv = Number(process.env.METRICSINTERVAL)
        if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv
        return DEFAULT_METRICS_INTERVAL
    }

    private initializeRoutes() {
        this.router.route('/')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                // configurar Kwirth es operacion administrativa: exige scope 'admin'
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( async (_req:Request, res:Response) => {
                try {
                    const stored = await SettingsApi.read(this.configMaps)
                    // se devuelven los valores efectivos, no los crudos, para que el front muestre lo que rige
                    res.status(200).json({ ...stored, metricsInterval: SettingsApi.resolveMetricsInterval(stored) })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error reading kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
            .put( async (req:Request, res:Response) => {
                try {
                    const incoming = req.body as IKwirthSettings
                    if (incoming.metricsInterval !== undefined && (isNaN(+incoming.metricsInterval) || +incoming.metricsInterval <= 0)) {
                        res.status(400).json({ error: 'metricsInterval must be a positive number' })
                        return
                    }
                    // merge sobre lo guardado: un PUT parcial no debe borrar ajustes que no envia
                    const stored = await SettingsApi.read(this.configMaps)
                    const merged: IKwirthSettings = { ...stored, ...incoming }
                    if (incoming.metricsInterval !== undefined) merged.metricsInterval = +incoming.metricsInterval
                    await this.configMaps.write(SETTINGS_KEY, merged)
                    if (this.onSettingsChanged) this.onSettingsChanged(merged)
                    res.status(200).json({ ...merged, metricsInterval: SettingsApi.resolveMetricsInterval(merged) })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error writing kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
    }
}
