import { IProviderStorage } from '@kwirthmagnify/kwirth-common-back'
import { ISugarlessConfig, newSugarlessConfig } from '../common/Sugarless'

/*
    Persistencia de la configuracion, partida por sensibilidad — el mismo criterio que usan los canales
    y el provider http-pull-push:

      - 'sugarless-config' (secret=false) -> ConfigMap: email, region, intervalo, tope, version.
      - 'sugarless-creds'  (secret=true)  -> Secret:    password.

    El reparto es deliberado y no se hereda del schema generico de providers del core: ese escribe TODO
    en un ConfigMap (ProviderManager.saveConfig), lo que dejaria la contraseña de una cuenta de salud en
    claro y legible con 'kubectl get cm -o yaml'. Por eso este provider es dueño de su configuracion y
    no usa configure() ni el ConfigMap gestionado por el core.

    El email se queda en el ConfigMap a proposito: es un identificador que hay que poder auditar para
    saber que cuenta se esta consultando, y no es un secreto que de acceso por si solo.
*/

const STORAGE_CONFIG = 'sugarless-config'
const STORAGE_CREDS = 'sugarless-creds'

interface IStoredCredentials {
    password?: string
}

export class ConfigStore {
    private storage: IProviderStorage | undefined

    constructor(storage: IProviderStorage | undefined) {
        this.storage = storage
    }

    get available(): boolean {
        return this.storage !== undefined
    }

    /*
        Recompone las dos mitades. Si no hay nada guardado devuelve los valores por defecto, que dejan
        el provider en estado "sin configurar": sin credenciales no se hace ni una peticion.
    */
    load = async (): Promise<ISugarlessConfig> => {
        if (!this.storage) return newSugarlessConfig()

        const stored: Partial<ISugarlessConfig> | undefined = await this.storage.readStorage(STORAGE_CONFIG, false)
        const creds: IStoredCredentials | undefined = await this.storage.readStorage(STORAGE_CREDS, true)

        // Se parte de los defectos y se pisa con lo guardado: asi un campo añadido en una version
        // posterior aparece con su valor por defecto en vez de como undefined.
        const defaults = newSugarlessConfig()
        return {
            ...defaults,
            ...(stored ?? {}),
            password: creds?.password ?? ''
        }
    }

    save = async (config: ISugarlessConfig): Promise<void> => {
        if (!this.storage) throw new Error('no storage available: this provider needs a Kwirth core that injects provider storage')

        const { password, ...publicPart } = config
        await this.storage.writeStorage(STORAGE_CONFIG, false, publicPart)
        await this.storage.writeStorage(STORAGE_CREDS, true, password ? { password } : {})
    }
}
