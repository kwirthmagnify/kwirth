import { test } from 'node:test'
import assert from 'node:assert/strict'
import { userInfoOf } from '../../../src/tools/auth/UserInfo'

/*
    What getUsers() hands the plugins for one stored user (plans/user-tags): the safe view, now with the tags.
    What it defends: never a secret, and never a tag a channel could not have been given through the API.
*/

test('userInfoOf: id, name, IdP and tags — never the password, the access key or the resources', () => {
    const info = userInfoOf({ id: 'ana', name: 'Ana', password: 'h', accessKey: { id: 'k' }, resources: 'admin::::', idp: 'entra', tags: ['agora:sre'] })
    assert.deepEqual(info, { id: 'ana', name: 'Ana', idp: 'entra', tags: ['agora:sre'] })
})

test('userInfoOf: a user without tags has no field; the name falls back to the id', () => {
    assert.deepEqual(userInfoOf({ id: 'bob' }), { id: 'bob', name: 'bob' })
    assert.deepEqual(userInfoOf({ id: 'bob', name: '', tags: [] }), { id: 'bob', name: 'bob' })
})

test('userInfoOf: tags edited by hand in the Secret are normalized, and a malformed one is dropped', () => {
    assert.deepEqual(userInfoOf({ id: 'c', name: 'C', tags: [' Agora:SRE', 'agora:sre', 'sre', 7, 'chat:exec'] })?.tags, ['agora:sre', 'chat:exec'])
    assert.equal(userInfoOf({ id: 'c', name: 'C', tags: 'agora:sre' })?.tags, undefined, 'not a list: no tags')
})

test('userInfoOf: an entry that is not a user is nothing', () => {
    for (const junk of [undefined, null, 'x', {}, { id: 3 }]) assert.equal(userInfoOf(junk), undefined)
})
