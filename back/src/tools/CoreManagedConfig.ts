import { IExtension } from '@kwirthmagnify/kwirth-common-back'
import { IExtensionImportResult, ISenderConfig, IWebhookConfig } from '@kwirthmagnify/kwirth-common'
import { IIdpInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import { PluginManager } from './PluginManager'
import { ProviderManager } from './ProviderManager'
import { SenderManager } from './SenderManager'
import { WebhookManager } from './WebhookManager'
import { AiToolsetManager } from './AiToolsetManager'
import { IdpManager } from './IdpManager'

/*
    La configuracion que el core guarda DE una extension, presentada como un `IExtension` mas.

    No toda la configuracion de una extension la guarda ella. Hay bastante que la guarda el core y que
    la extension ni siquiera ve: un sender no sabe cuales son sus configuraciones de envio —las guarda
    `SenderManager`—, un conector de IdP no puede enumerar sus instancias, y ningun toolset conoce sus
    concesiones. Pedirles que lo exporten seria pedirles algo que no pueden hacer.

    Asi que lo exporta quien puede. Y no hace falta un mecanismo aparte para ello: el core fabrica aqui
    un `IExtension` por entrada y lo pone donde iria la instancia. `ConfigBundleManager` sigue llamando
    a `exportConfig`/`importConfig` sin enterarse de quien hay al otro lado — la extension, el core, o
    los dos combinados.

    Consecuencia practica: casi toda extension tiene algo que exportar desde el primer dia, sin que su
    autor mueva un dedo. `IExtension` queda para las que ademas guardan cosas por su cuenta.

    Ver `plans/config-portability/PRD.md`.
*/

/** Une lo que sabe el core y lo que sabe la extension en un unico interlocutor. */
export const combine = (core: IExtension, own: IExtension | undefined): IExtension => {
    if (!own?.exportConfig && !own?.importConfig) return core
    return {
        exportConfig: async (options) => ({
            core: await core.exportConfig!(options),
            own: own.exportConfig ? await own.exportConfig(options) : undefined
        }),
        importConfig: async (data) => {
            const partes = (data ?? {}) as { core?: unknown, own?: unknown }
            const r1 = await core.importConfig!(partes.core)
            if (!own.importConfig || partes.own === undefined) return r1
            const r2 = await own.importConfig(partes.own)
            return {
                applied: r1.applied + r2.applied,
                skipped: r1.skipped + r2.skipped,
                warnings: [...r1.warnings, ...r2.warnings]
            }
        }
    }
}

const nada = (): IExtensionImportResult => ({ applied: 0, skipped: 0, warnings: [] })

/*
    Configuracion de instalacion de un plugin o un provider: un JSON generico que edita su gestor. El
    core no lo interpreta, asi que se copia entero.
*/
export const pluginInstallConfig = (manager: PluginManager, id: string): IExtension => ({
    exportConfig: async () => ({ installConfig: await manager.getConfig(id) }),
    importConfig: async (data) => {
        const cfg = (data as { installConfig?: Record<string, unknown> })?.installConfig
        if (!cfg || typeof cfg !== 'object') return nada()
        await manager.saveConfig(id, cfg)
        return { applied: 1, skipped: 0, warnings: [] }
    }
})

export const providerInstallConfig = (manager: ProviderManager, id: string): IExtension => ({
    exportConfig: async () => ({ installConfig: await manager.getConfig(id) }),
    importConfig: async (data) => {
        const cfg = (data as { installConfig?: Record<string, unknown> })?.installConfig
        if (!cfg || typeof cfg !== 'object') return nada()
        await manager.saveConfig(id, cfg)
        return { applied: 1, skipped: 0, warnings: [] }
    }
})

/*
    Las configuraciones de un sender. Viven en el core (`kwirth-sender-configs`), no en el sender, que
    solo recibe la suya al usarla.

    ⚠️ Pueden llevar credenciales dentro (la contraseña de un SMTP, el token de un Teams), y el core no
    sabe cuales de sus campos son secretos — eso lo declara el esquema del sender. Sin credenciales se
    vacian por esquema; si el sender no publica esquema, se omite la configuracion entera antes que
    arriesgarse a escribir una contraseña en un fichero que acaba en la carpeta de descargas de alguien.
*/
export const senderConfigs = (manager: SenderManager, id: string): IExtension => ({
    exportConfig: async (options) => {
        const configs = manager.getConfigs(id)
        if (options.includeCredentials) return { configs }

        const schema = manager.getSender(id)?.getConfigSchema?.()
        if (!schema) {
            return { configs: [], omitted: configs.length }
        }
        const secretos = schema.filter(f => f.type === 'password').map(f => f.name)
        return {
            configs: configs.map(c => {
                const limpio = { ...c } as ISenderConfig & Record<string, unknown>
                for (const campo of secretos) if (campo in limpio) limpio[campo] = ''
                return limpio
            })
        }
    },
    importConfig: async (data) => {
        const entrantes = (data as { configs?: unknown })?.configs
        if (!Array.isArray(entrantes)) return nada()
        const warnings: string[] = []
        const omitidas = (data as { omitted?: number })?.omitted
        if (omitidas) warnings.push(`${omitidas} configuration(s) were left out of the file because this sender does not declare which of its fields are secret`)
        let applied = 0
        let skipped = 0
        for (const config of entrantes as ISenderConfig[]) {
            if (manager.addConfig(id, config)) applied++
            else skipped++
        }
        return { applied, skipped, warnings }
    }
})

/** Lo mismo para un webhook, con el mismo cuidado con los secretos. */
export const webhookConfigs = (manager: WebhookManager, id: string): IExtension => ({
    exportConfig: async (options) => {
        const configs = manager.getConfigs(id)
        if (options.includeCredentials) return { configs }

        const schema = manager.getWebhook(id)?.getConfigSchema?.()
        if (!schema) return { configs: [], omitted: configs.length }
        const secretos = schema.filter(f => f.type === 'password').map(f => f.name)
        return {
            configs: configs.map(c => {
                const limpio = { ...c } as IWebhookConfig & Record<string, unknown>
                for (const campo of secretos) if (campo in limpio) limpio[campo] = ''
                return limpio
            })
        }
    },
    importConfig: async (data) => {
        const entrantes = (data as { configs?: unknown })?.configs
        if (!Array.isArray(entrantes)) return nada()
        const warnings: string[] = []
        const omitidas = (data as { omitted?: number })?.omitted
        if (omitidas) warnings.push(`${omitidas} configuration(s) were left out of the file because this webhook does not declare which of its fields are secret`)
        let applied = 0
        let skipped = 0
        for (const config of entrantes as IWebhookConfig[]) {
            if (manager.addConfig(id, config)) applied++
            else skipped++
        }
        return { applied, skipped, warnings }
    }
})

/*
    Las INSTANCIAS de un conector de IdP. Un conector puede tener varias —`IIdpInstanceConfig` apunta a
    el con `connectorId`, no al reves—, y el conector no puede enumerarlas: solo recibe una como
    parametro cuando toca autenticar.

    Viven en un Secret porque su `config` lleva el clientSecret. Que campos son secretos lo dice el
    esquema del propio conector, que para eso existe.
*/
export const idpInstances = (manager: IdpManager, connectorId: string): IExtension => ({
    exportConfig: async (options) => {
        const todas = await manager.exportConfig()
        const mias = Object.values(todas).filter(i => i.connectorId === connectorId)
        if (options.includeCredentials) return { instances: mias }

        const schema = manager.getConnectorSchema(connectorId)
        const secretos = (schema ?? []).filter(f => f.type === 'password').map(f => f.name)
        return {
            instances: mias.map(i => ({
                ...i,
                config: Object.fromEntries(Object.entries(i.config).map(([k, v]) => [k, secretos.includes(k) ? '' : v]))
            })),
            // Sin esquema no se sabe que vaciar, asi que se avisa en vez de suponer.
            schemaKnown: schema !== undefined
        }
    },
    importConfig: async (data) => {
        const entrantes = (data as { instances?: unknown })?.instances
        if (!Array.isArray(entrantes)) return nada()
        const warnings: string[] = []
        if ((data as { schemaKnown?: boolean })?.schemaKnown === false) {
            warnings.push('the file was exported without knowing which fields are secret; check every credential of these instances')
        }
        let applied = 0
        let skipped = 0
        for (const instancia of entrantes as IIdpInstanceConfig[]) {
            if (!instancia?.id || instancia.connectorId !== connectorId) {
                skipped++
                warnings.push(`an instance that does not belong to '${connectorId}' was discarded`)
                continue
            }
            await manager.saveInstance(instancia)
            applied++
        }
        return { applied, skipped, warnings }
    }
})

/*
    Las concesiones de un toolset: que plugins pueden usar sus tools. No las guarda el toolset —es solo
    back, sin objeto al que preguntar—, las guarda el core.

    ⚠️ Referencian PLUGINS por id. Si en el destino no esta ese plugin, la concesion no sirve de nada;
    `setGrants` devuelve los que si se aplicaron, y de ahi sale el aviso.
*/
export const toolsetGrants = (manager: AiToolsetManager, id: string): IExtension => ({
    exportConfig: async () => ({ grants: (await manager.listGrants())[id] ?? [] }),
    importConfig: async (data) => {
        const entrantes = (data as { grants?: unknown })?.grants
        if (!Array.isArray(entrantes)) return nada()
        const aplicados = await manager.setGrants(id, entrantes as string[])
        const perdidos = (entrantes as string[]).filter(p => !aplicados.includes(p))
        return {
            applied: aplicados.length,
            skipped: perdidos.length,
            warnings: perdidos.length ? [`granted to plugin(s) not installed here: ${perdidos.join(', ')}`] : []
        }
    }
})
