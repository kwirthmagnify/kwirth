import { IConfigBundle, IConfigBundleEntry, CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, bundleEntryKey, normalizeEntry } from './ConfigBundle'

/*
    Merging configuration bundles (plan: plans/config-merge).

    Several bundles (exported files, and perhaps this Kwirth's own export) become ONE, element by element:

      - an element present in ONE source goes in as it is
      - an element present in several sources and IDENTICAL in all of them goes in once
      - an element present in several sources that DIFFERS is a difference: the user picks the source

    "Identical" is the whole content, field by field and regardless of key order — two marketplaces with
    the same id and a different URL are a difference.

    The core part is split into elements because the core understands it (marketplaces by id, AI models by
    id, AI providers by name, login addresses by address, log levels by component key, loose values by
    field name). An extension's entry is OPAQUE, so it is one element, taken whole from one source.

    It is pure and stateless: nothing here reads or writes any Kwirth. The sources come in already
    validated (`validateBundle`): rejecting an invalid file is the caller's job, when it is loaded.
*/

/** What kind of element a merge item is: decides how it is identified and how it is shown. */
export enum EConfigMergeItemKind {
    SETTING = 'setting',                    // a loose value (metricsInterval, loginIpFilter.enabled…), by field name
    MARKETPLACE = 'marketplace',            // by id
    PACKAGE_REGISTRY = 'package-registry',  // by id
    TRUSTED_PROXY = 'trusted-proxy',        // by address
    LOGIN_IP_ALLOWED = 'login-ip-allowed',  // by address
    LOG_LEVEL = 'log-level',                // by component key
    AI_PROVIDER = 'ai-provider',            // by name
    AI_MODEL = 'ai-model',                  // by id
    EXTENSION = 'extension'                 // by type/id, the whole entry
}

/** A source as the user loaded it: a file, or this Kwirth's export. Already validated. */
export interface IConfigMergeSource {
    name: string
    bundle: IConfigBundle
}

/** One source's value for an item that differs. */
export interface IConfigMergeValue {
    sourceIndex: number
    /** What that source has, secrets included if it carries them. For an extension, the normalized entry. */
    value: unknown
}

/** An item present in several sources with different content: the user picks one. */
export interface IConfigMergeDifference {
    /** Stable: what a choice refers to. */
    key: string
    kind: EConfigMergeItemKind
    /** What the user reads: 'metricsInterval', 'acme', 'plugin/agora'… */
    label: string
    /** One per source that has it, in source order. */
    values: IConfigMergeValue[]
    /*
        The top-level fields that really differ (a secret blanked by a credential-free export does not count), so
        the user is shown what to decide and not the whole element. Undefined when the values are not objects (a
        loose setting): then the value itself is what differs.
    */
    fields?: string[]
}

/** What the analysis answers. */
export interface IConfigMergeAnalysis {
    /** What goes in without asking, by kind. */
    merged: Partial<Record<EConfigMergeItemKind, number>>
    differences: IConfigMergeDifference[]
    /** e.g. an AI model whose provider no source carries. */
    warnings: string[]
}

/** For every difference key, the index of the source chosen. */
export type TConfigMergeChoices = Record<string, number>

// ---------------------------------------------------------------------------------------------------------------------
// How the core part is split. A section is walked field by field: a field named in `lists` is an array of elements
// identified by `idOf`, one in `maps` is an object whose keys are the elements, one in `objects` is walked in turn,
// and ANY other field is a loose value. Unknown fields are therefore never lost: they become loose values.
// ---------------------------------------------------------------------------------------------------------------------

type TObject = Record<string, unknown>

interface IListRule {
    kind: EConfigMergeItemKind
    idOf: (element: unknown) => string | undefined
}

interface ISectionRule {
    lists?: Record<string, IListRule>
    maps?: Record<string, EConfigMergeItemKind>
    objects?: Record<string, ISectionRule>
}

const isObject = (v: unknown): v is TObject => typeof v === 'object' && v !== null && !Array.isArray(v)

const stringField = (field: string) => (element: unknown): string | undefined => {
    if (!isObject(element)) return undefined
    const v = element[field]
    return typeof v === 'string' && v !== '' ? v : undefined
}

// Address lists were string[] before they carried a comment: both shapes are read.
const addressOf = (element: unknown): string | undefined => typeof element === 'string' ? element : stringField('address')(element)

const SETTINGS_RULE: ISectionRule = {
    lists: {
        marketplaces: { kind: EConfigMergeItemKind.MARKETPLACE, idOf: stringField('id') },
        packageRegistries: { kind: EConfigMergeItemKind.PACKAGE_REGISTRY, idOf: stringField('id') },
        trustedProxies: { kind: EConfigMergeItemKind.TRUSTED_PROXY, idOf: addressOf }
    },
    objects: {
        loginIpFilter: {
            lists: {
                allowed: { kind: EConfigMergeItemKind.LOGIN_IP_ALLOWED, idOf: addressOf },
                // Where the trusted proxies lived until 2026-11-17. Kept where it is: merging does not transform.
                trustedProxies: { kind: EConfigMergeItemKind.TRUSTED_PROXY, idOf: addressOf }
            }
        },
        log: {
            maps: { levels: EConfigMergeItemKind.LOG_LEVEL }
        }
    }
}

const SHARED_AI_RULE: ISectionRule = {
    lists: {
        providers: { kind: EConfigMergeItemKind.AI_PROVIDER, idOf: stringField('name') },
        llms: { kind: EConfigMergeItemKind.AI_MODEL, idOf: stringField('id') }
    }
}

type TSection = 'settings' | 'sharedAi'

enum EPlacement {
    VALUE = 'value',
    LIST = 'list',
    MAP = 'map',
    EXTENSION = 'extension'
}

/** One element of one source, with where it goes back when the result is rebuilt. */
interface ISourceItem {
    key: string
    kind: EConfigMergeItemKind
    label: string
    placement: EPlacement
    section?: TSection
    /** The container's path inside the section (for a VALUE, the path of the object that holds it). */
    path: string[]
    /** The field (VALUE) or the map key (MAP). */
    name?: string
    value: unknown
}

/** A container (object, array) a source has, so that an empty one is not lost. */
interface IContainer {
    section: TSection
    path: string[]
    isArray: boolean
}

/** Key-order-independent JSON: what "identical" compares. Undefined fields are dropped, as in JSON. */
const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(e => e === undefined ? 'null' : canonical(e)).join(',')}]`
    if (isObject(v)) {
        const keys = Object.keys(v).filter(k => v[k] !== undefined).sort()
        return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    }
    return JSON.stringify(v) ?? 'null'
}

const sectionPrefix = (section: TSection, path: string[]): string => [section, ...path].join('.')

const walkSection = (section: TSection, obj: TObject, rule: ISectionRule, path: string[], items: ISourceItem[], containers: IContainer[]) => {
    for (const field of Object.keys(obj)) {
        const value = obj[field]
        if (value === undefined) continue
        const listRule = rule.lists?.[field]
        const mapKind = rule.maps?.[field]
        const objectRule = rule.objects?.[field]
        const fieldPath = [...path, field]
        if (listRule && Array.isArray(value)) {
            containers.push({ section, path: fieldPath, isArray: true })
            const seen = new Map<string, number>()
            for (const element of value) {
                // An element without an identifier is identified by its content: identical ones still merge.
                let id = listRule.idOf(element) ?? `#${canonical(element)}`
                // The same id twice in ONE source is not collapsed: that would drop data nobody chose to drop.
                const times = (seen.get(id) ?? 0) + 1
                seen.set(id, times)
                if (times > 1) id = `${id}#${times}`
                items.push({
                    key: `${sectionPrefix(section, fieldPath)}[${id}]`, kind: listRule.kind, label: id,
                    placement: EPlacement.LIST, section, path: fieldPath, value: element
                })
            }
        }
        else if (mapKind && isObject(value)) {
            containers.push({ section, path: fieldPath, isArray: false })
            for (const name of Object.keys(value)) {
                const v = value[name]
                if (v === undefined) continue
                items.push({
                    key: `${sectionPrefix(section, fieldPath)}{${name}}`, kind: mapKind, label: name,
                    placement: EPlacement.MAP, section, path: fieldPath, name, value: v
                })
            }
        }
        else if (objectRule && isObject(value)) {
            containers.push({ section, path: fieldPath, isArray: false })
            walkSection(section, value, objectRule, fieldPath, items, containers)
        }
        else {
            items.push({
                key: sectionPrefix(section, fieldPath), kind: EConfigMergeItemKind.SETTING, label: fieldPath.join('.'),
                placement: EPlacement.VALUE, section, path, name: field, value
            })
        }
    }
}

const SECTIONS: { section: TSection, rule: ISectionRule }[] = [
    { section: 'settings', rule: SETTINGS_RULE },
    { section: 'sharedAi', rule: SHARED_AI_RULE }
]

/** A source split into its elements. */
const decompose = (bundle: IConfigBundle): { items: ISourceItem[], containers: IContainer[] } => {
    const items: ISourceItem[] = []
    const containers: IContainer[] = []
    for (const { section, rule } of SECTIONS) {
        const obj = bundle.core?.[section]
        if (obj === undefined) continue
        if (isObject(obj)) {
            containers.push({ section, path: [], isArray: false })
            walkSection(section, obj, rule, [], items, containers)
        }
        else {
            // Not the shape the core writes: the section is one loose value, never dropped.
            items.push({
                key: section, kind: EConfigMergeItemKind.SETTING, label: section,
                placement: EPlacement.VALUE, section, path: [], value: obj
            })
        }
    }
    for (const entry of bundle.extensions) {
        // Read through the same normalization as the import, so format 1 and 2 never mix their shapes.
        const { coreConfig, config } = normalizeEntry(entry, bundle.formatVersion)
        // Only the fields it has: an absent one stays absent in the merged file.
        const normalized: IConfigBundleEntry = {
            type: entry.type,
            id: entry.id,
            ...(entry.version !== undefined ? { version: entry.version } : {}),
            ...(entry.marketplace !== undefined ? { marketplace: entry.marketplace } : {}),
            ...(coreConfig !== undefined ? { coreConfig } : {}),
            ...(config !== undefined ? { config } : {})
        }
        const label = bundleEntryKey(entry.type, entry.id)
        items.push({
            key: `extensions[${label}]`, kind: EConfigMergeItemKind.EXTENSION, label,
            placement: EPlacement.EXTENSION, path: [], value: normalized
        })
    }
    return { items, containers }
}

/*
    🔴 A CREDENTIAL-FREE EXPORT IS NOT A DIFFERENT CONFIGURATION. Without credentials the export blanks every
    secret: '' in the AI keys and in the extensions' secret fields, and the field simply absent in the marketplace
    tokens and the registry passwords (they live in a Secret, not in the settings). Compared as they are, a file
    with credentials and this Kwirth's export without them differed in every element that has a secret — the user
    was asked about all of them for nothing.

    So, in a source WITHOUT credentials, a blank string (any field: it is what the redaction writes) and an absent
    secret-named field are "not known", not "different": they agree with whatever the other source carries, and the
    merged value takes the one that is filled in.
*/
const SECRET_NAME = /(pass|pwd|token|secret|key|credential)/i

/*
    Notes the core's redaction ADDS to a credential-free export (back/src/tools/CoreManagedConfig.ts): whether the
    connector's schema was known to blank its secrets (`schemaKnown`), how many configurations were left out for
    lack of one (`omitted`). They describe the redaction, not the configuration, so a source with credentials
    never carries them.
*/
const REDACTION_NOTES = new Set(['schemaKnown', 'omitted'])

// The sentinel of a real conflict: `undefined` is a legitimate value (an absent field).
const CONFLICT = Symbol('conflict')
type TUnified = unknown | typeof CONFLICT

const unify = (a: unknown, aRedacted: boolean, b: unknown, bRedacted: boolean, field?: string): TUnified => {
    if (canonical(a) === canonical(b)) return a
    // a blank written by the redaction agrees with any string, and with the field absent (a redaction can write
    // the blank field where the source with credentials has none)
    if (aRedacted && a === '' && (typeof b === 'string' || b === undefined)) return b
    if (bRedacted && b === '' && (typeof a === 'string' || a === undefined)) return a
    // a note of the redaction is not configuration
    if (field !== undefined && REDACTION_NOTES.has(field)) {
        if (aRedacted && b === undefined) return undefined
        if (bRedacted && a === undefined) return undefined
    }
    // an absent secret (marketplace token, registry password) agrees with any string
    if (field !== undefined && SECRET_NAME.test(field)) {
        if (aRedacted && a === undefined && typeof b === 'string') return b
        if (bRedacted && b === undefined && typeof a === 'string') return a
    }
    if (isObject(a) && isObject(b)) {
        const result: TObject = {}
        const keys = new Set([...Object.keys(a), ...Object.keys(b)])
        for (const k of keys) {
            const u = unify(a[k], aRedacted, b[k], bRedacted, k)
            if (u === CONFLICT) return CONFLICT
            if (u !== undefined) result[k] = u
        }
        return result
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        const result: unknown[] = []
        for (let i = 0; i < a.length; i++) {
            const u = unify(a[i], aRedacted, b[i], bRedacted, field)
            if (u === CONFLICT) return CONFLICT
            result.push(u)
        }
        return result
    }
    return CONFLICT
}

/** The top-level fields that really differ (same tolerance), or undefined if the values are not objects. */
const differingFields = (values: IConfigMergeValue[], redacted: (sourceIndex: number) => boolean): string[] | undefined => {
    if (!values.every(v => isObject(v.value))) return undefined
    const keys = new Set<string>()
    values.forEach(v => Object.keys(v.value as TObject).forEach(k => keys.add(k)))
    return [...keys].filter(k => {
        let acc: unknown = (values[0].value as TObject)[k]
        let accRedacted = redacted(values[0].sourceIndex)
        for (const v of values.slice(1)) {
            const u = unify(acc, accRedacted, (v.value as TObject)[k], redacted(v.sourceIndex), k)
            if (u === CONFLICT) return true
            acc = u
            accRedacted = accRedacted && redacted(v.sourceIndex)
        }
        return false
    })
}

/** Every element of every source, grouped by key in first-seen order. */
interface IGroupedItem {
    first: ISourceItem
    values: IConfigMergeValue[]
    identical: boolean
    /** While identical: the value all of them agree on, with the secrets filled in from whoever carries them. */
    unified: unknown
    /** Whether every source that has contributed to `unified` came without credentials. */
    unifiedRedacted: boolean
}

const group = (sources: IConfigMergeSource[]): { grouped: Map<string, IGroupedItem>, containers: IContainer[] } => {
    const grouped = new Map<string, IGroupedItem>()
    const containers: IContainer[] = []
    const containerKeys = new Set<string>()
    sources.forEach((source, sourceIndex) => {
        const redacted = source.bundle.meta?.includesCredentials !== true
        const d = decompose(source.bundle)
        for (const c of d.containers) {
            const ck = sectionPrefix(c.section, c.path)
            if (containerKeys.has(ck)) continue
            containerKeys.add(ck)
            containers.push(c)
        }
        for (const item of d.items) {
            const g = grouped.get(item.key)
            if (!g) {
                grouped.set(item.key, { first: item, values: [{ sourceIndex, value: item.value }], identical: true, unified: item.value, unifiedRedacted: redacted })
            }
            else {
                if (g.identical) {
                    const u = unify(g.unified, g.unifiedRedacted, item.value, redacted)
                    if (u === CONFLICT) g.identical = false
                    else {
                        g.unified = u
                        g.unifiedRedacted = g.unifiedRedacted && redacted
                    }
                }
                g.values.push({ sourceIndex, value: item.value })
            }
        }
    })
    return { grouped, containers }
}

// An AI model points at its provider by name. One whose provider no source carries is said, not removed: it may
// exist at the destination.
const providerWarnings = (grouped: Map<string, IGroupedItem>): string[] => {
    const providers = new Set<string>()
    const models: { id: string, provider: string }[] = []
    for (const g of grouped.values()) {
        if (g.first.kind === EConfigMergeItemKind.AI_PROVIDER) providers.add(g.first.label)
        if (g.first.kind !== EConfigMergeItemKind.AI_MODEL) continue
        for (const v of g.values) {
            const provider = isObject(v.value) ? v.value.provider : undefined
            if (typeof provider === 'string' && provider !== '' && !models.some(m => m.id === g.first.label && m.provider === provider)) {
                models.push({ id: g.first.label, provider })
            }
        }
    }
    return models.filter(m => !providers.has(m.provider))
        .map(m => `AI model '${m.id}' uses provider '${m.provider}', which no source carries`)
}

/** Splits the sources and says what goes in on its own and what has to be chosen. */
export const analyzeMerge = (sources: IConfigMergeSource[]): IConfigMergeAnalysis => {
    const { grouped } = group(sources)
    const merged: Partial<Record<EConfigMergeItemKind, number>> = {}
    const differences: IConfigMergeDifference[] = []
    for (const [key, g] of grouped) {
        if (g.identical) {
            merged[g.first.kind] = (merged[g.first.kind] ?? 0) + 1
        }
        else {
            differences.push({
                key, kind: g.first.kind, label: g.first.label, values: g.values,
                fields: differingFields(g.values, i => sources[i].bundle.meta?.includesCredentials !== true)
            })
        }
    }
    return { merged, differences, warnings: providerWarnings(grouped) }
}

const containerAt = (root: TObject, path: string[], isArray: boolean): TObject | unknown[] => {
    let cur: TObject = root
    path.forEach((field, i) => {
        const last = i === path.length - 1
        if (cur[field] === undefined) cur[field] = last && isArray ? [] : {}
        if (!last) cur = cur[field] as TObject
    })
    return path.length === 0 ? root : cur[path[path.length - 1]] as TObject | unknown[]
}

/*
    The merged bundle, in the current format: what goes in on its own plus what was chosen. Throws if a difference
    has no choice, or a choice points at a source that does not have that element: what differs is decided by the
    user, never by an implicit order.
*/
export const buildMerged = (sources: IConfigMergeSource[], choices: TConfigMergeChoices, kwirthVersion: string, exportedAt: string): IConfigBundle => {
    const { grouped, containers } = group(sources)
    const core: Record<TSection, TObject | undefined> = { settings: undefined, sharedAi: undefined }
    const extensions: IConfigBundleEntry[] = []
    const contributing = new Set<number>()

    const root = (section: TSection): TObject => {
        if (!core[section]) core[section] = {}
        return core[section] as TObject
    }
    // Containers first, in first-seen order: an empty list in the sources is an empty list in the result.
    for (const c of containers) containerAt(root(c.section), c.path, c.isArray)

    for (const [key, g] of grouped) {
        let value: unknown
        if (g.identical) {
            // the agreed value: a secret blanked in one source comes from the one that carries it
            value = g.unified
            g.values.forEach(v => contributing.add(v.sourceIndex))
        }
        else {
            const chosen = choices[key]
            if (chosen === undefined) throw new Error(`no source chosen for '${key}'`)
            const v = g.values.find(x => x.sourceIndex === chosen)
            if (!v) throw new Error(`source ${chosen} does not carry '${key}'`)
            value = v.value
            contributing.add(chosen)
        }
        const item = g.first
        switch (item.placement) {
            case EPlacement.EXTENSION:
                extensions.push(value as IConfigBundleEntry)
                break
            case EPlacement.LIST:
                (containerAt(root(item.section!), item.path, true) as unknown[]).push(value)
                break
            case EPlacement.MAP:
                (containerAt(root(item.section!), item.path, false) as TObject)[item.name!] = value
                break
            case EPlacement.VALUE:
                if (item.name === undefined) core[item.section!] = value as TObject
                else (containerAt(root(item.section!), item.path, false) as TObject)[item.name] = value
                break
        }
    }

    return {
        kind: CONFIG_BUNDLE_KIND,
        formatVersion: CONFIG_BUNDLE_FORMAT_VERSION,
        meta: {
            exportedAt,
            kwirthVersion,
            source: `merge of: ${sources.map(s => s.name).join(', ')}`,
            // A merged file cannot claim to carry no secrets if any part of it comes from a source that does.
            includesCredentials: [...contributing].some(i => sources[i].bundle.meta?.includesCredentials === true)
        },
        core: {
            ...(core.settings !== undefined ? { settings: core.settings } : {}),
            ...(core.sharedAi !== undefined ? { sharedAi: core.sharedAi } : {})
        },
        extensions
    }
}
