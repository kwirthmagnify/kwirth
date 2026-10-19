import { AccessKey, parseResources, parseThinScope } from '@kwirthmagnify/kwirth-common'
import { EMagnifyScope, MAGNIFY_CLUSTER_SCOPE, MAGNIFY_HIDE_KINDS, MAGNIFY_SCOPE_LADDER } from './MagnifyScopes'

/*
    Who may see what, inside Magnify.

    🔴 It lives in `common` and not in `back` because BOTH sides ask. The back decides —it is the only
    one that can— and the front asks the same question for a different reason: not to offer what the
    answer will refuse. Offering it anyway is how you get a settings panel whose switches do nothing, or
    a toolbar full of channels that reject you when clicked.

    `scopeAllows` of common-back would have done the levels, but the front cannot reach common-back. So
    the walk lives here, once, and both sides import it.

    The core does not decide this. Magnify is a cluster channel (`resourced: false`), so the core never
    calls checkAkr for it: it hands over the key and the channel is the one that has to read it. Until
    now Magnify read nothing at all — neither the scopes nor the namespaces — so `cluster` was the only
    way in and it showed everything in the cluster.

    🔴 Everything here is decided RESOURCE BY RESOURCE, and then OR'd. That is not a detail, it is what
    the permission model means: a key saying `magnify$read:pre` + `magnify#read#{hide:[Secret]}:pro` can
    read Secrets in pre and not in pro. Collapsing the key into one set of scopes and one set of
    namespaces would mix the two and grant Secrets everywhere.
*/

export const levelOf = (scope: string): number => MAGNIFY_SCOPE_LADDER.indexOf(scope)

/*
    Kubernetes objects that do NOT live in a namespace — the INFRASTRUCTURE.

    🔴 They are the line this channel draws between a developer and an administrator. `magnify$read` and
    `magnify$write` are for the things a developer works with: workloads and configuration, in the
    namespaces their key reaches. Nodes, CRDs, PersistentVolumes, ClusterRoles and StorageClasses are the
    installation itself, and seeing them —or touching them— asks for `cluster`.

    It replaced a rule that read well and behaved badly: cluster-scoped kinds used to be visible to
    anybody whose key did not narrow namespaces, so ADDING a namespace to narrow a key silently took
    ClusterRoles away from it. Narrowing on one axis must not move another.
*/
const CLUSTER_SCOPED = new Set<string>([
    'CSIDriver', 'CSINode', 'ClusterRole', 'ClusterRoleBinding', 'ComponentStatus',
    'CustomResourceDefinition', 'IngressClass', 'MutatingWebhookConfiguration', 'Namespace', 'Node',
    'NodeMetrics', 'PersistentVolume', 'PriorityClass', 'RuntimeClass', 'StorageClass',
    'ValidatingWebhookConfiguration', 'VolumeAttachment'
])

/** One resource of the key, already taken apart into what this channel needs. */
interface IGrant {
    /** The highest level this resource reaches, -1 if it grants nothing here. */
    level: number
    /** Kinds this resource does NOT show. Empty when it grants in the wide form. */
    hidden: Set<string>
    /** The namespace patterns, empty when the resource is not restricted to any. */
    namespaces: string[]
}

/*
    What each resource of the key grants. A resource is read in both forms at once, because both can
    appear in it and the WIDER one wins — which is the rule of the whole model and not Magnify's.
*/
const grantsOf = (accessKey: AccessKey | undefined): IGrant[] => {
    if (!accessKey) return []
    try {
        return parseResources(accessKey.resources).map(r => {
            const namespaces = (r.namespaces || '').split(',').map(n => n.trim()).filter(Boolean)
            let level = -1
            let hidden: Set<string> | undefined
            for (const token of (r.scopes || '').split(',').map(s => s.trim()).filter(Boolean)) {
                const thin = parseThinScope(token)
                const tokenLevel = levelOf(thin ? thin.wide : token)
                if (tokenLevel < 0) continue
                if (tokenLevel > level) {
                    level = tokenLevel
                    hidden = undefined
                }
                if (tokenLevel !== level) continue
                /*
                    At the SAME level, the two forms meet: a wide token hides nothing, so it wipes out
                    whatever a thin one was hiding. Two thin ones at the same level keep what BOTH hide —
                    anything only one of them hides is granted by the other.
                */
                const tokenHides = thin ? kindsHiddenBy(thin.config) : new Set<string>()
                hidden = hidden === undefined ? tokenHides : intersect(hidden, tokenHides)
            }
            return { level, hidden: hidden ?? new Set<string>(), namespaces }
        })
    }
    catch (err) {
        // Malformed resources grant nothing. They cannot be trusted, and throwing here would escape into
        // the websocket handler that is asking.
        return []
    }
}

const intersect = (a: Set<string>, b: Set<string>): Set<string> => new Set([...a].filter(k => b.has(k)))

/** The configuration of a thin scope, read as Magnify defines it. Anything else hides nothing. */
const kindsHiddenBy = (config: unknown): Set<string> => {
    if (!config || typeof config !== 'object') return new Set<string>()
    const raw = (config as Record<string, unknown>)[MAGNIFY_HIDE_KINDS]
    // The editor stores a multiselect as ONE comma-separated string; a key written by hand may bring a
    // list. Both are read, and anything else is taken as hiding nothing.
    const kinds = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : []
    return new Set(kinds.map(k => k.trim()).filter(Boolean))
}

/*
    Does this resource reach that namespace? The patterns are REGULAR EXPRESSIONS, as everywhere else in
    an accessKey, and a resource with none reaches every namespace.
*/
const reaches = (grant: IGrant, namespace: string): boolean => {
    if (grant.namespaces.length === 0) return true
    if (!namespace) return false
    return grant.namespaces.some(pattern => {
        try { return new RegExp(`^${pattern}$`).test(namespace) }
        catch (err) { return false }   // a pattern that does not compile matches nothing
    })
}

/** Does the key reach `required` anywhere at all? What gates opening the channel and mutating. */
export const allows = (accessKey: AccessKey | undefined, required: EMagnifyScope | string): boolean => {
    const requiredLevel = levelOf(required)
    return grantsOf(accessKey).some(g => g.level >= requiredLevel)
}

/*
    🔴 The question every listing and every event has to ask: may this key see an object of this kind, in
    this namespace?

    A cluster-scoped kind arrives with no namespace, and is only granted by a resource that restricts
    none — the decision described at CLUSTER_SCOPED.
*/
export const canSee = (accessKey: AccessKey | undefined, kind: string, namespace?: string): boolean =>
    grantsOf(accessKey).some(g => {
        if (g.level < levelFor(kind, EMagnifyScope.READ)) return false
        if (g.hidden.has(kind)) return false
        // Infrastructure has no namespace to be matched against; reaching 'cluster' is the whole check.
        return CLUSTER_SCOPED.has(kind) || reaches(g, namespace ?? '')
    })

/** Whether the kind is worth asking Kubernetes about at all: nobody can see it, so nobody fetches it. */
export const canSeeAnyOf = (accessKey: AccessKey | undefined, kind: string): boolean =>
    grantsOf(accessKey).some(g => g.level >= levelFor(kind, EMagnifyScope.READ) && !g.hidden.has(kind))

/*
    🔴 May this key CHANGE an object of this kind, here? Asked per object and not per command, because
    'delete' means one thing on a Pod and another on a Node: the first is a developer's, the second is
    the installation's.

    A hidden kind cannot be changed either — writing to what you are not allowed to see would be a way
    of finding out it is there.
*/
export const canChange = (accessKey: AccessKey | undefined, kind: string, namespace?: string): boolean =>
    grantsOf(accessKey).some(g => {
        if (g.level < levelFor(kind, EMagnifyScope.WRITE)) return false
        if (g.hidden.has(kind)) return false
        return CLUSTER_SCOPED.has(kind) || reaches(g, namespace ?? '')
    })

/*
    What a kind asks for: its own level if it belongs to a namespace, and `cluster` if it is
    infrastructure — whatever was being asked of it. That is the developer/administrator line, in one
    place, so that seeing and changing cannot drift apart.
*/
const levelFor = (kind: string, asked: EMagnifyScope): number =>
    levelOf(CLUSTER_SCOPED.has(kind) ? MAGNIFY_CLUSTER_SCOPE : asked)

/*
    Does this key restrict anything at all? A key that narrows neither namespaces nor kinds —`cluster`,
    `admin`, or a plain `magnify$read` over everything— sees the cluster whole, so nothing is gained by
    walking its listings. It is what keeps the filtering off the path of the keys that have no limits.
*/
export const needsFiltering = (accessKey: AccessKey | undefined): boolean =>
    grantsOf(accessKey).some(g => g.namespaces.length > 0 || g.hidden.size > 0)

/*
    Keeps from a Kubernetes list only what the key may see. The list is filtered rather than refused,
    because a key limited to one namespace asking for Pods wants ITS pods, not an error.
*/
export const filterItems = <T extends { metadata?: { namespace?: string } }>(
    accessKey: AccessKey | undefined, kind: string, items: T[]
): T[] => items.filter(item => canSee(accessKey, kind, item.metadata?.namespace))
