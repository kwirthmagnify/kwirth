import { EExtensionType, IConfigFieldDef, IConfigValidationError, applyConfigDefaults, pruneConfig, validateConfig } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from './ISecrets'
import { ELogComponent, logWarning } from './Logging'

/*
    THE store of every extension's INSTALLATION configuration (plans/extension-config, S1).

    Before it, each manager kept its own the way it happened to: a Secret per router, a ConfigMap per
    provider and plugin, the login's inside its payload, one shared Secret for every IdP instance, one
    shared ConfigMap for all the senders and another for all the webhooks. Seven ways of doing the same
    thing, four of them with credentials in a ConfigMap. Now there is one:

      · ONE Secret per extension, `kwirth-<type>-<id>-config`. A Secret and not a ConfigMap even for the
        fields that are not secret: one object per extension is simpler than two to put back together,
        without the schema there is no knowing which field is a secret, and fields holding a token are
        often typed 'text' (a URL with the key inside). User's decision, 2026-11-18.
      · Stored as `{ data: base64(JSON) }`: a Kubernetes Secret wants its values already in base64, and it
        is the shape routers have used from the start, so their configuration carries over untouched.

    🔴 The store does NOT know the shape of what it keeps. A provider's object, a sender's
    ISenderStoredConfig with its named configurations, an IdP instance: it stores what it is given. Defaults
    and validation are the MANAGER's, with applyConfigDefaults / pruneConfig / validateConfig from
    kwirth-common, because only the manager knows the schema and whether the shape is simple or multiple.

    An unreadable configuration never takes Kwirth down: it is reported and read as absent, so the
    extension starts with its defaults and the admin can save it again.
*/

const SUFFIX = '-config'

/** The name of an extension's configuration Secret. `id` is the extension's (or, for IdPs, the instance's). */
export const extensionConfigName = (type: EExtensionType, id: string): string => `kwirth-${type}-${id}${SUFFIX}`

export class ExtensionConfigStore {
    constructor(private secrets: ISecrets) {}

    /** What is stored, as it was stored, or undefined when there is nothing (or nothing readable). */
    async read(type: EExtensionType, id: string): Promise<unknown> {
        const name = extensionConfigName(type, id)
        const content: unknown = await this.secrets.read(name)
        if (content === undefined || content === null) return undefined
        const data = typeof content === 'object' ? (content as Record<string, unknown>)['data'] : undefined
        if (typeof data !== 'string') {
            logWarning(ELogComponent.CORE, `Configuration '${name}' has no data: it is treated as absent`)
            return undefined
        }
        try {
            return JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
        }
        catch {
            logWarning(ELogComponent.CORE, `Configuration '${name}' is not readable: it is treated as absent`)
            return undefined
        }
    }

    /** Stores `value` whole (no merge). A failure is thrown, for the caller to report it. */
    async write(type: EExtensionType, id: string, value: unknown): Promise<void> {
        const data = Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
        await this.secrets.write(extensionConfigName(type, id), { data })
    }

    /** Removes it. One that does not exist is not an error. */
    async delete(type: EExtensionType, id: string): Promise<void> {
        await this.secrets.delete(extensionConfigName(type, id))
    }

    // ── The SIMPLE shape: one configuration object per extension ──────────────────────────────────────
    //
    // Provider, login, router, plugin and AI toolset keep exactly that, so the whole sequence lives here
    // once. The multiple shapes (sender, webhook, IdP) use read/write and the same kwirth-common functions,
    // per named configuration.

    /**
     * The CURRENT values: what is stored, completed with the schema's defaults. Nothing stored (or nothing
     * readable) gives just the defaults.
     */
    async readSimple(type: EExtensionType, id: string, schema: IConfigFieldDef[]): Promise<Record<string, unknown>> {
        const stored = await this.read(type, id)
        const values = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {}
        return applyConfigDefaults(schema, values)
    }

    /**
     * Drops what the schema no longer declares, validates and, when everything fits, stores it whole. The
     * errors are returned, not thrown: an invalid value is the admin's to fix, not a failure. A write
     * failure IS thrown.
     *
     * An EMPTY schema means it could not be obtained (a router with no live instance, say): then nothing is
     * pruned nor validated, it is stored as it comes and a warning is logged. Validation must not stop an
     * admin from configuring a broken extension in order to fix it (plan, decision P2).
     */
    async writeSimple(type: EExtensionType, id: string, schema: IConfigFieldDef[], values: Record<string, unknown>): Promise<IConfigValidationError[]> {
        if (schema.length === 0) {
            logWarning(ELogComponent.CORE, `Configuration of ${type} '${id}' saved without validation: its schema is not available`)
            await this.write(type, id, values)
            return []
        }
        const pruned = pruneConfig(schema, values)
        const errors = validateConfig(schema, pruned)
        if (errors.length > 0) return errors
        await this.write(type, id, pruned)
        return []
    }

    /** The ids of the extensions of `type` with a stored configuration. */
    async list(type: EExtensionType): Promise<string[]> {
        const prefix = `kwirth-${type}-`
        const names = await this.secrets.list(prefix)
        return names
            .filter(n => n.startsWith(prefix) && n.endsWith(SUFFIX) && n.length > prefix.length + SUFFIX.length)
            .map(n => n.slice(prefix.length, n.length - SUFFIX.length))
    }
}
