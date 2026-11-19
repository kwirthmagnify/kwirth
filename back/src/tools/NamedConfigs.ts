import { IConfigFieldDef, IConfigValidationError, validateConfig } from '@kwirthmagnify/kwirth-common'

/*
    The MULTIPLE shape of an extension's configuration (plans/extension-config, S6): a base of COMMON fields
    plus N named configurations — a sender's mail server and its recipients, a webhook's entries.

    What ExtensionConfigStore.writeSimple does for one configuration object, done here per named
    configuration and over the base:
      · the schema's `common` fields belong to the base; the rest, to each configuration
      · what the schema does not declare is dropped — except `name` and `description`, which are the
        CORE's keys of a named configuration, not the extension's fields
      · what does not fit is returned as errors, never thrown: it is the admin's to fix

    An EMPTY schema means it could not be obtained (a broken extension): then nothing is pruned nor
    validated, so that the admin can still save the configuration that fixes it (plan, decision P2). The
    caller logs it.
*/

/** The keys every named configuration carries for the core, whatever its schema says. */
const CORE_KEYS = ['name', 'description']

const commonFields = (schema: IConfigFieldDef[]): IConfigFieldDef[] => schema.filter(f => f.common)
const ownFields = (schema: IConfigFieldDef[]): IConfigFieldDef[] => schema.filter(f => !f.common)

// The values of `fields` that `values` has. Not pruneConfig: that one keeps everything when the list is
// empty (its "no schema" case), and here an empty list means "none of these fields", not "no schema".
const pick = (fields: IConfigFieldDef[], values: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const f of fields) if (f.name in values) result[f.name] = values[f.name]
    return result
}

/*
    A 'json' field may hold its value ALREADY PARSED: the senders that bring their own dialog (composite,
    timed, tee, regex) save their flow or their rules as an object, not as text. validateConfig checks the
    text form the generic forms send, so an object is handed over as its text — it is valid JSON by
    construction.
*/
const asValidatable = (fields: IConfigFieldDef[], values: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...values }
    for (const f of fields) {
        const v = result[f.name]
        if (f.type === 'json' && v !== null && typeof v === 'object') result[f.name] = JSON.stringify(v)
    }
    return result
}

/** The base: only the schema's `common` fields. */
export const pruneCommon = (schema: IConfigFieldDef[], common: Record<string, unknown>): Record<string, unknown> =>
    schema.length === 0 ? { ...common } : pick(commonFields(schema), common)

/** One named configuration: its own fields (not the common ones), plus `name` and `description`. */
export const pruneNamedConfig = (schema: IConfigFieldDef[], config: Record<string, unknown>): Record<string, unknown> => {
    if (schema.length === 0) return { ...config }
    const result = pick(ownFields(schema), config)
    for (const key of CORE_KEYS) if (key in config) result[key] = config[key]
    return result
}

/** What does not fit in one named configuration. Its name is always required, declared or not. */
export const validateNamedConfig = (schema: IConfigFieldDef[], config: Record<string, unknown>): IConfigValidationError[] => {
    if (schema.length === 0) return []
    const fields = ownFields(schema)
    const errors = validateConfig(fields, asValidatable(fields, config))
    const declaresName = fields.some(f => f.name === 'name')
    if (!declaresName && (typeof config.name !== 'string' || config.name.trim() === '')) errors.push({ field: 'name', message: `'Name' is required` })
    return errors
}

/*
    What does not fit in the whole document: the base and every configuration. An error of a configuration
    says WHICH one, because the document is saved from the base's screen and the field alone would not tell.
*/
export const validateNamedStored = (schema: IConfigFieldDef[], common: Record<string, unknown>, configs: Record<string, unknown>[]): IConfigValidationError[] => {
    if (schema.length === 0) return []
    const fields = commonFields(schema)
    const errors = validateConfig(fields, asValidatable(fields, common))
    for (const config of configs) {
        for (const e of validateNamedConfig(schema, config)) errors.push({ field: e.field, message: `Config '${String(config.name ?? '')}': ${e.message}` })
    }
    return errors
}
