// The core's catalogue of RBAC scopes: Kwirth's own built-ins + those every registered channel declares
// through getScopeCatalog(). It serves to (a) populate the security editor and (b) validate that a
// user's/API key's scopes are known when storing them.
//
// FOLLOW-UP: the built-ins are today DUPLICATED with the front end's enum (ResourceEditor). Unify them in
// `common` (a single IExtensionScope list shared front+back) and consume the /core/scopes endpoint from the
// front end.
import { IExtensionScope, parseThinScope } from '@kwirthmagnify/kwirth-common'
import { TChannelConstructor } from '../channels/IChannel'

// The core's general scopes (not a plugin's). The descriptions are aligned with AccessKey's documentation.
export const CORE_BUILTIN_SCOPES: IExtensionScope[] = [
    { scope: 'cluster',   label: 'cluster',   description: 'Full access — admin level, can do everything' },
    { scope: 'admin',     label: 'admin',     description: 'Administration (users, security, API keys)' },
    { scope: 'api',       label: 'api',       description: 'Create API keys' },
    { scope: 'view',      label: 'view',      description: 'View logs' },
    { scope: 'filter',    label: 'filter',    description: 'View logs (filtered)' },
    { scope: 'stream',    label: 'stream',    description: 'Stream data from instances' },
    { scope: 'snapshot',  label: 'snapshot',  description: 'Read point-in-time snapshots' },
    { scope: 'create',    label: 'create',    description: 'Create instances' },
    { scope: 'subscribe', label: 'subscribe', description: 'Subscribe to instances' },
    { scope: 'none',      label: 'none',      description: 'No permission' }
]

/** The complete catalogue: the core's built-ins + those declared by the registered channels through getScopeCatalog(). Deduplicated. */
export const buildScopeCatalog = (registeredChannels: Map<string, TChannelConstructor>): IExtensionScope[] => {
    const seen = new Set<string>()
    const out: IExtensionScope[] = []
    const add = (s: IExtensionScope): void => { if (s?.scope && !seen.has(s.scope)) { seen.add(s.scope); out.push(s) } }
    CORE_BUILTIN_SCOPES.forEach(add)
    for (const Ctor of registeredChannels.values()) {
        try {
            // a throwaway instance merely to read the catalogue (static data); a channel's constructor is
            // usually light (the heavy work goes in startChannel). Should it require context and fail, it
            // is ignored.
            const inst = new (Ctor as unknown as new (a?: unknown, b?: unknown) => { getScopeCatalog?: () => IExtensionScope[] })(undefined, undefined)
            for (const s of inst.getScopeCatalog?.() ?? []) add(s)
        }
        catch { /* canal que exige contexto en el constructor o sin catálogo → se omite */ }
    }
    return out
}

/** The set of valid scopes, for validating when storing users/API keys. */
export const validScopeSet = (registeredChannels: Map<string, TChannelConstructor>): Set<string> =>
    new Set(buildScopeCatalog(registeredChannels).map(s => s.scope))

/*
    Returns the UNRECOGNISED scopes present in a resources string (`scopes:ns:groups:pods:containers;…`).

    A THIN scope (`channel#scope#<b64>`) is judged by the permission it narrows: `magnify#read#…` is known
    exactly when `magnify$read` is. Without this the editor would compose a token that saving rejects with
    a 400, which is the shape of bug where a feature works everywhere except where it is used.

    It is still a check worth making. At runtime an unknown token already grants nothing —the channel's
    ladder answers -1— so this does not guard the door; what it guards is the admin, who gets told they
    narrowed a scope that does not exist instead of granting something that will silently do nothing.
*/
export const unknownScopesIn = (resources: string, valid: Set<string>): string[] => {
    const bad: string[] = []
    for (const resource of (resources || '').split(';')) {
        const scopes = (resource.split(':')[0] || '').split(',').map(s => s.trim()).filter(Boolean)
        for (const sc of scopes) {
            const known = valid.has(parseThinScope(sc)?.wide ?? sc)
            if (!known && !bad.includes(sc)) bad.push(sc)
        }
    }
    return bad
}
