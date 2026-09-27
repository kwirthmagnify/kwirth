/*
    Whose failure is this: the core's or an extension's?

    It matters because the answer decides whether the core dies. An `unhandledRejection` was always
    treated as fatal: `exitAndLog()` took the pod down. And that means **a promise without a catch in a
    third-party extension brings the whole of Kwirth down**, with all its channels, for every user.
    It really happened: the 'trivy' provider did a fire-and-forget with no catch, and subscribing to it
    with no payload from provider-debug was enough to kill the core.

    Killing the process over a CORE failure still makes sense —it may have been left in an inconsistent
    state— but over an extension's failure it does not: the right thing is to isolate it, leave a trace
    with its name and carry on serving everybody.

    Attribution is done by the stack, which is the only thing there is. The core loads each extension's
    back end from a file in the system tmpdir (`/tmp/kwirth-plugin-<id>-back.js`), so when the rejection
    is born in its code, that is where its trail is.

    ⚠️ The heuristic is DELIBERATELY conservative: if it cannot be attributed to an extension, it is
    treated as a core failure and the process dies, as it did until now. We prefer one restart too many
    over silently swallowing a core failure believing it was a plugin's.
*/

// `/tmp/kwirth-<type>-<id>-back.js`, which is how the core leaves an extension's back end in order to require it
const EXTENSION_BACK_FILE = /kwirth-(plugin|provider|sender|webhook|aitoolset|idp|login|homepage|theme|irq)-([A-Za-z0-9._-]+?)-(back|front)\.js/

export interface IFailureOrigin {
    kind: string
    id: string
}

/*
    Returns the extension the failure can be attributed to, or undefined when there is no way of knowing.
    It accepts anything because a rejection can carry whatever inside: an Error, a string, some library's
    object, or nothing at all.
*/
export const failureOrigin = (value: unknown): IFailureOrigin|undefined => {
    const stack = value instanceof Error ? value.stack : undefined
    // A rejection with a value that is not an Error carries no stack, and with no stack there is nobody to attribute it to
    if (!stack) return undefined
    const found = stack.match(EXTENSION_BACK_FILE)
    return found ? { kind: found[1], id: found[2] } : undefined
}
