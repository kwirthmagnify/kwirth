/*
    User tags (plans/user-tags): an admin labels each Kwirth user with tags of the form `<extension>:<value>`,
    and each extension reads its own and decides what to do with them (an AI assistant that answers an
    executive with an overview and an SRE with the detail, for instance).

    The core does NOT interpret them (D3): it stores them, checks their FORM, lets the admin edit them and hands
    them out in IUserInfo. 🔴 They grant nothing (D4): access is the access key's scopes; a tag changes HOW
    something is done, never WHETHER it can be.

    Both the back (on saving a user) and the front (before saving) use these, so they validate the same way.
*/

/** `<extension>:<value>`: the extension like an extension id, the value letters, digits, '.', '_' and '-'; up to 64 each. */
export const USER_TAG_RE = /^[a-z][a-z0-9-]{0,63}:[a-z0-9._-]{1,64}$/

/** At most this many tags per user. */
export const USER_TAGS_MAX = 32

/**
 * The tags as they are stored: trimmed, in lower case, without empties or repeats, in the order given. It does NOT
 * drop a malformed one — that is for `userTagsProblem` to refuse, so a typo is said instead of vanishing.
 * Anything that is not a list of strings is no tags.
 */
export const normalizeUserTags = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return []
    const out: string[] = []
    for (const t of raw) {
        if (typeof t !== 'string') continue
        const tag = t.trim().toLowerCase()
        if (tag !== '' && out.indexOf(tag) < 0) out.push(tag)   // indexOf: common compiles for ES2015
    }
    return out
}

/** Why these (normalized) tags cannot be saved, or undefined when they can. */
export const userTagsProblem = (tags: string[]): string | undefined => {
    const bad = tags.filter(t => !USER_TAG_RE.test(t))
    if (bad.length > 0) return `Invalid tag${bad.length > 1 ? 's' : ''} ${bad.map(t => `'${t}'`).join(', ')}: the form is <extension>:<value>, e.g. chat:sre`
    if (tags.length > USER_TAGS_MAX) return `At most ${USER_TAGS_MAX} tags per user (${tags.length} given)`
    return undefined
}

/** The tags of one extension: those that start with `<extension>:` — the only ones an extension should read (D2). */
export const userTagsOf = (tags: string[] | undefined, extensionId: string): string[] =>
    (tags ?? []).filter(t => t.startsWith(`${extensionId}:`))
