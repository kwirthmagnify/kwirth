import { IConfigFieldDef } from './ExtensionConfig'

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
