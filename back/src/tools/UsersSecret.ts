import { V1Secret } from '@kubernetes/client-node'

/*
    Which namespace holds the users Secret, when Kwirth runs OUTSIDE the cluster.

    Inside the cluster this question does not arise: the pod knows its own namespace and that is the one
    that rules. Outside, the process is not a pod and has no namespace of its own, so the users Secret is
    what names it — and from that namespace come the Secrets AND the ConfigMaps of the whole core, not
    just the users.

    🔴 Which is why the answer is a LIST and not a name. With one Kwirth installed there is one candidate
    and no question to ask. With two, 'the first one found' silently adopts the other installation's
    store, and the symptom does not point here at all: it shows up as the OTHER Kwirth no longer
    recognising its own admin, because this one has started writing over its Secret. The caller refuses
    to start when more than one answers, and it can only do that if it is told how many there were.

    It lives here, and not inline where it is used, so the harness can actually exercise it: the rules
    below (which spelling wins, what counts as a candidate) are the ones worth pinning down, and
    `index.ts` is not loaded by the tests.
*/

/** The two spellings of the users Secret, in order of preference: the dashed one wins. */
export const USERS_SECRET_NAMES = ['kwirth-users', 'kwirth.users']

/**
 * The namespaces of the Secrets that could name this Kwirth's own namespace, given everything the
 * cluster returned. Empty means there is none; more than one means it cannot be told apart.
 *
 * The spellings are NOT merged: the dashed one is looked for first and, only if nothing is named that
 * way, the dotted one. A cluster holding one of each is still two installations, and both are reported.
 */
export const usersSecretNamespaces = (secrets: V1Secret[]): string[] => {
    const namespacesOf = (name: string): string[] =>
        secrets.filter(s => s.metadata?.name === name).map(s => s.metadata?.namespace ?? '(unknown)')

    for (const name of USERS_SECRET_NAMES) {
        const found = namespacesOf(name)
        if (found.length > 0) return found
    }
    return []
}

/**
 * The namespace to adopt, given what the launcher asked for and what the cluster holds. Same shape as
 * above on purpose: one means resolved, none means there is nothing to adopt, several means it cannot
 * be told apart and the caller refuses to start.
 *
 * 🔴 An explicit namespace WINS and is not verified against the cluster. That is the point of it: it
 * exists for the case where there are several Kwirths installed and the search cannot decide — so
 * making it depend on that same search would defeat it. It also has to work for a namespace that does
 * not hold a users Secret yet, which is an ordinary first start. Whoever sets it is saying "this one",
 * and a typo shows up as an empty store rather than as a wrong one: that is why the caller logs the
 * value it took and whether anything was there.
 */
export const resolveUsersNamespace = (envNamespace: string | undefined, secrets: V1Secret[]): string[] => {
    const asked = envNamespace?.trim()
    if (asked) return [asked]
    return usersSecretNamespaces(secrets)
}
