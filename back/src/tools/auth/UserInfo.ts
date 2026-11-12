import { IUserInfo, normalizeUserTags, USER_TAG_RE } from '@kwirthmagnify/kwirth-common'

/*
    The SAFE view of one stored user that the plugins get through getUsers(): id, name, IdP and tags — never the
    password, the access key or the resources. Undefined for an entry that is not a user.

    The tags (plans/user-tags) are normalized again and a malformed one is dropped: the API refuses them on save,
    but the users Secret can be edited by hand, and a channel must never receive a tag it could not have been given.
*/
export const userInfoOf = (u: unknown): IUserInfo | undefined => {
    const user = u as { id?: unknown, name?: unknown, idp?: unknown, tags?: unknown } | undefined
    if (!user || typeof user.id !== 'string') return undefined
    const tags = normalizeUserTags(user.tags).filter(t => USER_TAG_RE.test(t))
    return {
        id: user.id,
        name: typeof user.name === 'string' && user.name ? user.name : user.id,
        ...(typeof user.idp === 'string' && user.idp ? { idp: user.idp } : {}),
        ...(tags.length > 0 ? { tags } : {})
    }
}
