// Catálogo de scopes RBAC del core: built-in del propio Kwirth + los que declara cada canal registrado
// vía getScopeCatalog(). Sirve para (a) poblar el editor de seguridad y (b) validar que los scopes de un
// user/API key son conocidos al guardarlos.
//
// FOLLOW-UP: los built-in están hoy DUPLICADOS con el enum del front (ResourceEditor). Unificar en `common`
// (una sola lista IExtensionScope compartida front+back) y consumir el endpoint /core/scopes desde el front.
import { IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { TChannelConstructor } from '../channels/IChannel'

// Scopes generales del core (no de plugin). Descripciones alineadas con la doc de AccessKey.
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

// TEMPORAL (F2): scopes de plugins que AÚN no declaran getScopeCatalog (ops/trivy). Estaban hardcodeados
// en el enum del front (ResourceEditor); se mueven aquí para que /core/scopes los siga sirviendo mientras
// el front deja de tener enum propio. QUITAR cuando ops/trivy declaren su catálogo (getScopeCatalog).
export const LEGACY_PLUGIN_SCOPES: IExtensionScope[] = [
    { scope: 'ops$get',          label: 'ops$get',          description: 'Ops: read resources' },
    { scope: 'ops$execute',      label: 'ops$execute',      description: 'Ops: execute commands' },
    { scope: 'ops$xterm',        label: 'ops$xterm',        description: 'Ops: interactive terminal' },
    { scope: 'ops$restart',      label: 'ops$restart',      description: 'Ops: restart workloads' },
    { scope: 'trivy$workload',   label: 'trivy$workload',   description: 'Trivy: workload-scoped access' },
    { scope: 'trivy$kubernetes', label: 'trivy$kubernetes', description: 'Trivy: cluster-scoped access' }
]

/** Catálogo completo: built-in del core + legacy (F2) + los declarados por los canales registrados. Dedup. */
export const buildScopeCatalog = (registeredChannels: Map<string, TChannelConstructor>): IExtensionScope[] => {
    const seen = new Set<string>()
    const out: IExtensionScope[] = []
    const add = (s: IExtensionScope): void => { if (s?.scope && !seen.has(s.scope)) { seen.add(s.scope); out.push(s) } }
    CORE_BUILTIN_SCOPES.forEach(add)
    LEGACY_PLUGIN_SCOPES.forEach(add)
    for (const Ctor of registeredChannels.values()) {
        try {
            // instancia throwaway solo para leer el catálogo (dato estático); el constructor de un canal
            // suele ser ligero (el trabajo pesado va en startChannel). Si requiere contexto y falla, se ignora.
            const inst = new (Ctor as unknown as new (a?: unknown, b?: unknown) => { getScopeCatalog?: () => IExtensionScope[] })(undefined, undefined)
            for (const s of inst.getScopeCatalog?.() ?? []) add(s)
        }
        catch { /* canal que exige contexto en el constructor o sin catálogo → se omite */ }
    }
    return out
}

/** Conjunto de scopes válidos, para validar al guardar users/API keys. */
export const validScopeSet = (registeredChannels: Map<string, TChannelConstructor>): Set<string> =>
    new Set(buildScopeCatalog(registeredChannels).map(s => s.scope))

/** Devuelve los scopes NO reconocidos presentes en un string de resources (`scopes:ns:groups:pods:containers;…`). */
export const unknownScopesIn = (resources: string, valid: Set<string>): string[] => {
    const bad: string[] = []
    for (const resource of (resources || '').split(';')) {
        const scopes = (resource.split(':')[0] || '').split(',').map(s => s.trim()).filter(Boolean)
        for (const sc of scopes) if (!valid.has(sc) && !bad.includes(sc)) bad.push(sc)
    }
    return bad
}
