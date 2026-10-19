import { AccessKey, parseResources } from '@kwirthmagnify/kwirth-common'

/*
    Deciding whether a key was granted the OBJECT an operation acts on.

    It is the other half of `scopeAllows`, and they are not interchangeable: that one answers 'may this
    key do this?', and this one 'may it do it HERE?'. A channel needs both, and File Manager showed what
    happens with only the first — the verb was gated in 0.2.27 and the target was not, so a key granted
    on one namespace read a file from a pod in another. Verified by exploiting it on 2026-10-17.

    It lives here because excubitor and trivy have endpoints of the same shape and will need it: a
    security check copied into three plugins is a check that diverges.
*/

/** What an operation acts on, as much of it as the caller knows. */
export interface IResourceTarget {
    namespace?: string
    pod?: string
    container?: string
}

/*
    🔴 UNANCHORED, and that is a decision, not an oversight.

    It mirrors the core's `getValidValues`, which does `new RegExp(r).test(value)`. So a key granted on
    'kwirth' also reaches 'kwirth-system', and one on 'pre' reaches 'pre-produccion'. Anchoring it here
    would close that door for the channels using this helper and leave it open everywhere else, so the
    same key would mean two different things depending on who read it — which is worse than the door.

    What was done instead is to SAY it: the security editor now states, above the fields, that they are
    regular expressions matched anywhere in the name, and that '^kwirth$' is how you mean one namespace.
*/
const matches = (patterns: string, value: string | undefined): boolean => {
    const list = patterns.split(',').map(p => p.trim()).filter(Boolean)
    if (list.length === 0) return true     // a dimension the key does not restrict allows everything
    if (!value) return false               // ...but one it DOES restrict needs something to compare
    return list.some(pattern => {
        try { return new RegExp(pattern).test(value) }
        catch (err) { return false }       // a pattern that does not compile matches nothing
    })
}

/*
    Whether any resource of the key covers this target. Resources are OR'd, as everywhere else: one
    resource is enough, and within it every dimension the key restricts has to match.

    ⚠️ `groups` is NOT evaluated, and it is missing here because it is missing in the core: `checkResource`
    has an empty `//+++` where it would go (finding A10 of plans/auth-hardening). Implementing it here
    would make the channels using this helper stricter than the core with the same key — the worst of the
    three ways out, as that finding says. It is the core's decision, and when it is taken this is one of
    the places that changes.
*/
export const matchesResource = (resources: string, target: IResourceTarget): boolean => {
    try {
        return parseResources(resources).some(r =>
            matches(r.namespaces || '', target.namespace) &&
            matches(r.pods || '', target.pod) &&
            matches(r.containers || '', target.container)
        )
    }
    catch (err) {
        // Malformed resources authorise nothing, and this must not throw: it is called from route
        // handlers where an escaping exception becomes an unhandledRejection.
        return false
    }
}

/** The same question when what is at hand is the key the core handed over. No key, no permission. */
export const keyMatchesResource = (accessKey: AccessKey | undefined, target: IResourceTarget): boolean =>
    !!accessKey && matchesResource(accessKey.resources, target)
