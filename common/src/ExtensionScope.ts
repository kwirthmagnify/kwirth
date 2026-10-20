import { IConfigFieldDef } from './ExtensionConfig'
import { AccessKey, parseResources } from './AccessKey'

// Catalogue of RBAC scopes an extension (a channel) declares. It is used to populate the security
// editor (User/API Security) in the front end and to validate and manage permissions in the back end.
// Every scope follows the naming `<plugin>$<scope>` (e.g. `defender$poladmin`), so scopes from
// different plugins never collide.
//
// It is exposed at runtime through `IChannel.getScopes()` (optional), in common-front as well as in
// common-back; it is NOT static metadata from the package.json or the manifest.
export interface IExtensionScope {
    scope: string          // "<plugin>$<scope>", p.ej. "defender$poladmin"
    label: string          // etiqueta legible para el admin, p.ej. "Defender · Admin"
    description: string    // qué permite el scope (se muestra al conceder permisos)
    /**
     * The form the admin fills in to NARROW this scope, if the channel accepts being narrowed. Declaring
     * it is what turns the scope into a thin one in the security editor: ticking it opens this form and
     * what comes out is a `channel#scope#<b64>` token instead of the plain `channel$scope`.
     *
     * Omitting it is the normal case and keeps the scope as it has always been. A channel that declares
     * it still has to ENFORCE it — see `parseThinScope`.
     */
    config?: IConfigFieldDef[]
}

/** What a thin scope token carries once taken apart. */
export interface IThinScope {
    /** The channel that declared it, e.g. 'fileman'. */
    channel: string
    /** The scope WITHOUT the channel, e.g. 'write'. */
    scope: string
    /**
     * The same permission in its WIDE form, e.g. 'fileman$write' — which is what the channel's ladder is
     * written in, so this is what `getChannelScopeLevel()` takes.
     *
     * It is derived from the two fields above and could be composed at the call site. It is handed over
     * already composed because EVERY channel reading a thin scope needs it, and a step every consumer
     * repeats is a step that drifts — the whole lesson of the scope check that had been written three
     * times before it moved to common-back.
     */
    wide: string
    /** Whatever the channel put in. Only the channel knows its shape, so it arrives unknown. */
    config: unknown
}

const SEPARATOR = '#'
/** What the WIDE form joins by, the one every channel's ladder is written in: 'fileman$write'. */
const WIDE_SEPARATOR = '$'

/*
    `resources` is split by ';' (resources), ':' (fields) and ',' (scopes), and now by '#'. None of those
    may appear inside the two names, or the token stops being parseable where it is stored.

    '$' is excluded too, for a different reason: it is the separator of the WIDE form, and a name carrying
    one would produce a token that reads like a different scope than it is.
*/
const FORBIDDEN = /[#$;:,]/

/**
 * A scope narrowed by a configuration the CHANNEL defines and only the channel understands: a path, a
 * regex, a list, a whole JSON object.
 *
 * The base64 is not obfuscation, it is the only safe encoding. The alphabet (A-Z a-z 0-9 + / =) contains
 * none of the four separators `resources` is split by, so whatever the admin types — a path with
 * slashes, a regex full of punctuation, a JSON with commas — survives being stored inside an accessKey.
 * The admin never sees it or types it: they fill in a form and the front composes this.
 *
 * ⚠️ It THROWS on an invalid name, and that is deliberate: `channel` and `scope` do not come from the
 * admin, they come from the channel's own `getScopeCatalog()`. A name with a separator in it is a bug in
 * the catalogue, and a token built from it would be silently unparseable later — the worst possible
 * moment to find out, because it is a PERMISSION that stops meaning what it says.
 */
export const buildThinScope = (channel: string, scope: string, config: unknown): string => {
    if (!channel || FORBIDDEN.test(channel)) throw new Error(`Invalid channel for a thin scope: '${channel}'`)
    if (!scope || FORBIDDEN.test(scope)) throw new Error(`Invalid scope for a thin scope: '${scope}'`)
    return `${channel}${SEPARATOR}${scope}${SEPARATOR}${encodeBase64(JSON.stringify(config ?? null))}`
}

/**
 * Takes a thin scope apart, and says `undefined` to everything else.
 *
 * 🔴 It NEVER throws, and that is the whole contract. It is called from the channels' authorisation path,
 * which is reached from async handlers where an escaping exception becomes an unhandledRejection — the
 * kind that took the core down on 2026-10-16. And what reaches it is not trustworthy: an accessKey is
 * tamper-proof, but a key is also made BY HAND through `/key`, so the token may be anything at all.
 *
 * `undefined` means 'this is not a thin scope', and the caller must treat that as granting NOTHING. A
 * classic `fileman$write` returns undefined here, which is correct: it is not thin, and the wide path
 * (the ladder) is what grants it.
 */
export const parseThinScope = (token: string): IThinScope | undefined => {
    if (typeof token !== 'string') return undefined
    // Exactly three parts: base64 contains no '#', so a fourth means it is not one of ours.
    const parts = token.split(SEPARATOR)
    if (parts.length !== 3) return undefined
    const [channel, scope, encoded] = parts
    if (!channel || !scope) return undefined
    try {
        const config = JSON.parse(decodeBase64(encoded))
        return { channel, scope, wide: `${channel}${WIDE_SEPARATOR}${scope}`, config }
    }
    catch (err) {
        // Broken base64, or base64 of something that is not JSON. Both are 'not mine', not a crash.
        return undefined
    }
}

/** Is this token thin, without taking it apart? For telling the two forms apart while reading a key. */
export const isThinScope = (token: string): boolean => parseThinScope(token) !== undefined

/*
    UTF-8 safe, and WITHOUT Buffer: this module is bundled into the browser as well, and `common` carries
    no node types. `btoa` only accepts code points below 256, so a path or a label with an accent has to
    go through TextEncoder first — otherwise it throws where the admin least expects it.
*/
const encodeBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
}

const decodeBase64 = (encoded: string): string => {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
}

/*
    ─── Deciding whether a key was granted enough ────────────────────────────────────────────────────

    🔴 THIS LIVES IN `common` AND NOT IN `common-back` BECAUSE BOTH SIDES ASK.

    It was written in common-back first, and that was half the answer: the back can import it, the FRONT
    cannot — common-back is resolved from the core's server-side global, which does not exist in a
    browser. So every extension whose UI had to decide whether to offer something wrote the walk again,
    each one slightly different: agora's `agoraScopeAllows`, magnify's `levelFor`, excubitor's
    `maxExcubitorScopeLevel`, status's `scopes.includes('admin')` and trivy's `keyReaches`, now gone.
    A security check copied into every plugin is a security check that diverges — the day one of them
    gets the comparison wrong, nothing says so.

    🔴 What is read is what the KEY CARRIES, never what the client asked for. An accessKey cannot be
    tampered with —a bearer key is an HMAC over its own resources, a registered one is compared whole
    against the server's list— while `instanceConfig.scope` is a field of an unsigned JSON the browser
    composes. Reading the latter would let anybody grant themselves a scope by typing it.

    The ladder stays the extension's: it is passed in as `levelOf`, usually its own
    `getChannelScopeLevel`. This module does not know what 'fileman$write' means, and should not.
*/

/**
 * Whether any granted scope reaches the level `required` needs.
 *
 * Same semantics as the core's `getScopeLevel`: resources are OR'd, the HIGHEST scope wins, and a scope
 * the ladder does not know is -1 (indexOf), so it grants nothing. That last part is what makes an
 * unknown token —a thin scope on a channel that does not understand it, a scope that was renamed— fail
 * CLOSED without anybody writing code for it.
 *
 * ⚠️ It NEVER throws: malformed resources authorise nothing. An exception from an async handler would
 * escape as an unhandledRejection and take the process with it.
 */
export const scopeAllows = (resources: string, required: string, levelOf: (scope: string) => number): boolean => {
    const requiredLevel = levelOf(required)
    /*
        🔴 ASKING FOR A SCOPE THAT IS NOT ON THE LADDER REFUSES EVERYBODY. It used to grant everybody.

        `levelOf` answers -1 for what it does not know, so a required level of -1 was reached by every
        scope — including another -1. A channel asking for a misspelled or renamed scope
        (`this.allows(key, 'fileman$writte')`) therefore opened the door to ANY key, and the only visible
        sign was a permission that never seemed to deny anything.

        Found by a test written when this moved down from common-back (A13), not in production: today
        the three callers —excubitor, fileman, trivy— all ask for scopes that are on their own ladder,
        which is why it never showed. An unknown required scope is a bug in the channel, and a bug in a
        channel must not end in an open door.
    */
    if (requiredLevel < 0) return false
    try {
        return parseResources(resources).some(r => r.scopes.split(',').some(sc => levelOf(sc.trim()) >= requiredLevel))
    }
    catch {
        return false
    }
}

/** The same question when what is at hand is the key the core handed over. No key, no permission. */
export const keyAllows = (accessKey: AccessKey | undefined, required: string, levelOf: (scope: string) => number): boolean =>
    !!accessKey && scopeAllows(accessKey.resources, required, levelOf)

/**
 * The HIGHEST level the key reaches on a ladder, or -1 when it reaches none.
 *
 * `scopeAllows` answers yes/no, which is what a door needs; a UI often needs the level itself, to show
 * three different things rather than hide one. Excubitor wrote this separately for that reason
 * (`maxExcubitorScopeLevel`), and without it here the copy would just be made again.
 */
export const scopeLevelOf = (resources: string, levelOf: (scope: string) => number): number => {
    try {
        return parseResources(resources).reduce((max, r) =>
            r.scopes.split(',').reduce((m, sc) => Math.max(m, levelOf(sc.trim())), max), -1)
    }
    catch {
        return -1
    }
}
