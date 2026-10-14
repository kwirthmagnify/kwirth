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

/*  `/tmp/kwirth-<tipo>-<id>-back.js`, que es como el core deja el back de una extensión para requerirlo.

    🔴 El tipo NO se enumera, a propósito. Enumerarlo convierte cada tipo nuevo en una pérdida silenciosa
    de aislamiento: nadie se acuerda de venir aquí, y el síntoma no es un error sino que el core se muera
    por un fallo ajeno. Ya pasó: la lista llevaba un `irq` que no existe en `EExtensionType` ni en ninguna
    otra parte del core, y en cambio le faltaba `dce` —cuyo back se carga exactamente así
    (`kwirth-dce-<id>-back.js`, DceManager)—, de modo que el fallo de un DCE se contaba como fallo del
    core y tiraba el proceso. La forma del nombre ya es bastante distintiva; el tipo concreto solo sirve
    para escribirlo en la traza. */
const EXTENSION_BACK_FILE = /kwirth-([a-z]+)-([A-Za-z0-9._-]+?)-(back|front)\.js/

/*  Y en DESARROLLO no hay copia en el tmpdir: `kwirth-dev.json` apunta al `dist/` del repo y el core hace
    el require directamente ahí (`PluginManager.registerDevPlugin`), así que el rastro es
    `…/<tipo>s/<id>/dist/back.js` — el plural del directorio del repo (`plugins/`, `providers/`, `dces/`…),
    que da el tipo en singular. Sin esto la atribución no funcionaba justo donde se desarrolla: el fallo de
    un plugin en dev se contaba como fallo del core y tiraba el proceso. */
const EXTENSION_DEV_FILE = /[/\\]([a-z]+)s[/\\]([A-Za-z0-9._-]+)[/\\]dist[/\\](back|front)\.js/

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
    const found = stack.match(EXTENSION_BACK_FILE) ?? stack.match(EXTENSION_DEV_FILE)
    return found ? { kind: found[1], id: found[2] } : undefined
}
