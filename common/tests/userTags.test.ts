import { test } from 'node:test'
import assert from 'node:assert/strict'
import { USER_TAG_RE, USER_TAGS_MAX, normalizeUserTags, userTagsProblem, userTagsOf } from '../src/UserTags'

/*
    User tags (plans/user-tags). The back refuses on save and the front warns before saving with these same
    functions, so what is tested here is what both sides agree on: the form, the normalization, the limit, and
    that an extension reads only its own.
*/

test('the form: <extension>:<value>, lower case', () => {
    for (const ok of ['chat:sre', 'agora:executive', 'my-ext:a.b_c-1', 'x:1']) assert.ok(USER_TAG_RE.test(ok), ok)
    for (const bad of ['sre', ':sre', 'chat:', 'Chat:sre', 'chat:SRE', '1chat:sre', 'chat:s r e', 'chat:sre:x', 'chat_x:sre', '']) {
        assert.ok(!USER_TAG_RE.test(bad), bad)
    }
    assert.ok(USER_TAG_RE.test(`a:${'v'.repeat(64)}`))
    assert.ok(!USER_TAG_RE.test(`a:${'v'.repeat(65)}`), 'the value up to 64')
    assert.ok(USER_TAG_RE.test(`${'e'.repeat(64)}:v`))
    assert.ok(!USER_TAG_RE.test(`${'e'.repeat(65)}:v`), 'the extension up to 64')
})

test('normalizeUserTags: trimmed, lower case, no empties nor repeats, order kept; junk is no tags', () => {
    assert.deepEqual(normalizeUserTags([' Agora:SRE ', 'agora:sre', '', 'chat:exec', '  ']), ['agora:sre', 'chat:exec'])
    assert.deepEqual(normalizeUserTags(['b:1', 'a:1']), ['b:1', 'a:1'], 'the order given, not sorted')
    assert.deepEqual(normalizeUserTags(['ok:1', 42, null, { t: 'x' }]), ['ok:1'], 'a non-string entry is dropped')
    for (const junk of [undefined, null, 'agora:sre', 3, {}]) assert.deepEqual(normalizeUserTags(junk), [])
    // A malformed one is KEPT, so that the check below can say it instead of it vanishing.
    assert.deepEqual(normalizeUserTags(['sre']), ['sre'])
})

test('userTagsProblem: names the malformed ones, and the limit', () => {
    assert.equal(userTagsProblem([]), undefined)
    assert.equal(userTagsProblem(['agora:sre', 'chat:exec']), undefined)
    assert.match(userTagsProblem(['sre']) ?? '', /Invalid tag 'sre': the form is <extension>:<value>/)
    assert.match(userTagsProblem(['sre', 'x', 'ok:1']) ?? '', /Invalid tags 'sre', 'x'/)
    const many = Array.from({ length: USER_TAGS_MAX + 1 }, (_, i) => `t:${i}`)
    assert.match(userTagsProblem(many) ?? '', /At most 32 tags per user \(33 given\)/)
    assert.equal(userTagsProblem(many.slice(0, USER_TAGS_MAX)), undefined, 'exactly the limit is fine')
})

test('userTagsOf: an extension reads only its own', () => {
    const tags = ['agora:sre', 'chat:exec', 'agora:executive', 'agoraplus:x']
    assert.deepEqual(userTagsOf(tags, 'agora'), ['agora:sre', 'agora:executive'], 'not agoraplus:x — the prefix is the whole id')
    assert.deepEqual(userTagsOf(undefined, 'agora'), [])
    assert.deepEqual(userTagsOf(tags, 'none'), [])
})
