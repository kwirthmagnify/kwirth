import { IExtension } from '@kwirthmagnify/kwirth-common-back'
import { IExtensionImportResult, ISenderConfig, ISenderStoredConfig, IWebhookConfig } from '@kwirthmagnify/kwirth-common'
import { IIdpInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import { PluginManager } from './PluginManager'
import { ProviderManager } from './ProviderManager'
import { SenderManager } from './SenderManager'
import { WebhookManager } from './WebhookManager'
import { AiToolsetManager } from './AiToolsetManager'
import { IdpManager } from './IdpManager'

/*
    The configuration the core stores ABOUT an extension, presented as one more `IExtension`.

    Not all of an extension's configuration is stored by the extension. A good deal of it is stored by the
    core and the extension never even sees it: a sender does not know what its sending configurations are
    — `SenderManager` stores them — an IdP connector cannot enumerate its instances, and no toolset knows
    its grants. Asking them to export that would be asking for something they cannot do.

    So whoever can, exports it. And no separate mechanism is needed for it: the core manufactures an
    `IExtension` per entry here and hands it to `ConfigBundleManager` as the entry's `coreInstance`,
    beside the extension's own `instance`. The manager asks both and writes each answer to its own field
    of the bundle (`coreConfig` and `config`) without finding out who is on the other side.

    🔴 THE TWO PARTS ARE NEVER MERGED INTO ONE. They were until 2026-10-29, through a `combine()` that
    returned `{ core, own }` when the extension had something of its own and the core's part bare when it
    did not — so an entry's shape depended on who implemented what, and a file written before the
    extensions adopted the contract was read back as if its only part were theirs, losing the
    installation configuration without a word. Two sources, two fields.

    The practical consequence: nearly every extension has something to export from day one, without its
    author lifting a finger. `IExtension` is left for those that also store things on their own account.

    Ver `plans/config-portability/PRD.md`.
*/

const nada = (): IExtensionImportResult => ({ applied: 0, skipped: 0, warnings: [] })

/*
    A plugin's or a provider's installation configuration: generic JSON edited by its manager. The core
    does not interpret it, so it is copied whole.
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
    A sender's configurations. They live in the core (`kwirth-sender-configs`), not in the sender, which
    only receives its own when using it.

    A sender stores TWO things: a set of named configs and, optionally, a BASE config — common fields
    shared by all of them (an SMTP host, a default from). The base is merged into each config before the
    sender sees it. Both travel together as `ISenderStoredConfig`: the base as top-level fields, the
    configs as a `configs` array. Exporting only the array (as `getConfigs` does) loses the base, and
    importing config-by-config with `addConfig` never restores it.

    ⚠️ They can carry credentials inside (an SMTP's password, a Teams token), and the core does not know
    which of their fields are secret — the sender's schema declares that. Without credentials they are
    emptied by schema; if the sender publishes no schema, the whole configuration is left out rather than
    risk writing a password into a file that ends up in somebody's downloads folder.
*/
export const senderConfigs = (manager: SenderManager, id: string): IExtension => ({
    exportConfig: async (options) => {
        const stored = manager.getSenderStoredConfig(id)
        if (options.includeCredentials) return { stored }

        const schema = manager.getSender(id)?.getConfigSchema?.()
        if (!schema) {
            return { stored: { configs: [] }, omitted: stored.configs.length }
        }
        const secretos = schema.filter(f => f.type === 'password').map(f => f.name)
        // Strip secrets from BOTH the base fields and each named config.
        const { configs, ...common } = stored
        const cleanCommon: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(common)) cleanCommon[k] = secretos.includes(k) ? '' : v
        return {
            stored: {
                ...cleanCommon,
                configs: configs.map(c => {
                    const limpio = { ...c } as ISenderConfig & Record<string, unknown>
                    for (const campo of secretos) if (campo in limpio) limpio[campo] = ''
                    return limpio
                })
            }
        }
    },
    importConfig: async (data) => {
        const stored = (data as { stored?: unknown })?.stored
        if (!stored || typeof stored !== 'object') return nada()
        const storedConfig = stored as ISenderStoredConfig
        if (!Array.isArray(storedConfig.configs)) return nada()
        const warnings: string[] = []
        const omitidas = (data as { omitted?: number })?.omitted
        if (omitidas) warnings.push(`${omitidas} configuration(s) were left out of the file because this sender does not declare which of its fields are secret`)
        // setSenderStoredConfig replaces the base AND the configs in one shot: the base is not
        // recoverable from the configs alone, so a config-by-config addConfig would leave it empty.
        manager.setSenderStoredConfig(id, storedConfig)
        return { applied: storedConfig.configs.length, skipped: 0, warnings }
    }
})

/** The same for a webhook, with the same care over the secrets. */
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
        /*
            🔴 REEMPLAZA, no añade. Lo que queda despues de importar es EXACTAMENTE lo que traia el
            fichero: las configuraciones que el destino tuviera de mas desaparecen. Es la regla de todo
            el bundle y no admite excepciones — un import que a veces sustituye y a veces fusiona
            obliga a saberse de memoria cual hace cada extension, y nadie puede.

            ⚠️ Un webhook pierde ademas el TOKEN de las configuraciones que se van, que es la URL por la
            que le llaman desde fuera. Es la consecuencia de traerse otra configuracion: las que entran
            nacen con tokens nuevos y hay que repegar las URL en GitLab, Jira o quien llame.
        */
        const configs = entrantes as IWebhookConfig[]
        if (!manager.setWebhookStoredConfig(id, { configs })) {
            return { applied: 0, skipped: configs.length, warnings: [...warnings, `webhook '${id}' is not registered here`] }
        }
        return { applied: configs.length, skipped: 0, warnings }
    }
})

/*
    An IdP connector's INSTANCES. A connector can have several — `IIdpInstanceConfig` points at it with
    `connectorId`, not the other way round — and the connector cannot enumerate them: it only receives one
    as a parameter when it is time to authenticate.

    They live in a Secret because their `config` carries the clientSecret. Which fields are secret is said
    by the connector's own schema, which is what it is there for.
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
            // With no schema it is not known what to empty, so it is warned about rather than assumed.
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
        const validas: IIdpInstanceConfig[] = []
        for (const instancia of entrantes as IIdpInstanceConfig[]) {
            if (!instancia?.id || instancia.connectorId !== connectorId) {
                skipped++
                warnings.push(`an instance that does not belong to '${connectorId}' was discarded`)
                continue
            }
            validas.push(instancia)
        }

        /*
            🔴 REEMPLAZA. Las instancias de ESTE conector que el destino tuviera y no vengan en el
            fichero se borran: lo que queda es exactamente lo que traia. La regla es la del bundle
            entero y no admite excepciones — un import que a veces sustituye y a veces fusiona obliga a
            saberse de memoria cual hace cada extension, y nadie puede.

            Solo las de este conector: el fichero no habla de los demas, y borrar lo que no menciona
            seria pasarse de lo que se ha pedido.
        */
        const todas = await manager.exportConfig()
        for (const existente of Object.values(todas)) {
            if (existente.connectorId !== connectorId) continue
            if (validas.some(i => i.id === existente.id)) continue
            await manager.deleteInstance(existente.id)
        }

        for (const instancia of validas) {
            await manager.saveInstance(instancia)
            applied++
        }
        return { applied, skipped, warnings }
    }
})

/*
    A toolset's grants: which plugins may use its tools. The toolset does not store them — it is back end
    only, with no object to ask — the core does.

    ⚠️ They reference PLUGINS by id. If that plugin is not at the destination, the grant is of no use;
    `setGrants` returns the ones that were applied, and the warning comes from there.
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
