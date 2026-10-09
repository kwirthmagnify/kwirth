import { createHash } from 'crypto'

/*
    Name of the ConfigMap that holds a user's profile store.

    🔴 It exists because the name was built by gluing the user id onto a prefix, and a Kubernetes resource
    name is not free-form: it must be an RFC-1123 subdomain — lowercase letters, digits, `-` and `.`,
    starting and ending with alphanumeric, 253 characters at most. A user id of `admin` happens to satisfy
    that. An id of `jfvilas@gmail.com` does not: the `@` makes the name invalid, the API server rejects the
    write, and the store cannot be created AT ALL.

    What that looked like from the outside (dev, 2026-10-09): a user added a cluster, tested it, saved it,
    used it — and after reloading the page it was gone. The POST had returned 500 and the front, which
    does not check the response, carried on. Nothing was ever written, and nothing said so. It affected
    every value that user kept in their store, not just clusters, and it affects EVERY user whose id is an
    email address — which is all of them the moment an IdP is in play.

    Two rules here:

      · An id that already yields a valid name is left EXACTLY as it was. `admin` keeps writing to
        `kwirth-store-admin`, so no existing store moves and no migration is needed.
      · An id that needs fixing gets the sanitised form PLUS a short digest of the original. The digest is
        not decoration: without it, `a@b.com` and `a-b.com` would both collapse to `a-b.com` and two
        different people would silently share one store. Two distinct ids must never land on the same name.
*/

const PREFIX = 'kwirth-store-'
const MAX_NAME = 253
const VALID_NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/

/** Short, stable digest of the original id: what keeps two different ids from colliding after sanitising. */
const digestOf = (userId: string): string => createHash('sha1').update(userId).digest('hex').slice(0, 8)

export const userStoreName = (userId: string): string => {
    const asIs = PREFIX + userId
    if (asIs.length <= MAX_NAME && VALID_NAME.test(asIs)) return asIs   // compat: los stores de siempre no se mueven
    const sanitised = userId
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '-')
        .replace(/^[^a-z0-9]+/, '')
        .replace(/[^a-z0-9]+$/, '')
    const digest = digestOf(userId)
    // El recorte se hace sobre la parte legible, NUNCA sobre el digest: es lo que garantiza que no haya dos
    // usuarios en el mismo store, y truncarlo devolvería el problema que viene a resolver.
    const room = MAX_NAME - PREFIX.length - digest.length - 1
    const body = (sanitised.slice(0, Math.max(1, room)) || 'user').replace(/[^a-z0-9]+$/, '') || 'user'
    return `${PREFIX}${body}-${digest}`
}
