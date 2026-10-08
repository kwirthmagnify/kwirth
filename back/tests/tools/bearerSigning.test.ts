import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as crypto from 'crypto'
import { AuthorizationManagement } from '../../src/tools/AuthorizationManagement'
import { accessKeyBuild } from '@kwirthmagnify/kwirth-common'

/*
    A6 of plans/auth-hardening: bearer keys are signed with HMAC-SHA256 over 'resources|expire', keyed by
    the master key, and compared in constant time. This replaces md5(masterKey|resources|expire), which was
    a broken hash used as a secret-prefixed MAC. The change is breaking on purpose: a key signed the old
    way must no longer validate.
*/

const MK = 'a-strong-secret-master-key'
const RES = 'cluster::::'
const EXP = Date.now() + 86400000

const bearer = (id: string, resources = RES, expire: number = EXP) => accessKeyBuild(id, 'bearer:' + expire, resources)

test('a key signed with signBearer validates', () => {
    const id = AuthorizationManagement.signBearer(MK, RES, EXP)
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer(id)), true)
})

test('a different master key does not validate', () => {
    const id = AuthorizationManagement.signBearer(MK, RES, EXP)
    assert.equal(AuthorizationManagement.validBearerKey('another-master-key', bearer(id)), false)
})

test('tampering the resources breaks the signature (escalation attempt)', () => {
    // signed for 'view', presented as 'cluster'
    const id = AuthorizationManagement.signBearer(MK, 'view:dev:::', EXP)
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer(id, 'cluster::::')), false)
})

test('tampering the expire breaks the signature', () => {
    const id = AuthorizationManagement.signBearer(MK, RES, EXP)
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer(id, RES, EXP + 1)), false)
})

test('the old md5 key is rejected (breaking change is effective)', () => {
    const md5 = crypto.createHash('md5').update(`${MK}|${RES}|${EXP}`).digest('hex')
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer(md5)), false)
})

test('an id of the wrong length does not throw and is rejected', () => {
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer('short')), false)
    assert.equal(AuthorizationManagement.validBearerKey(MK, bearer('')), false)
})

test('HMAC output is a 64-char hex (sha256), not md5', () => {
    const id = AuthorizationManagement.signBearer(MK, RES, EXP)
    assert.match(id, /^[0-9a-f]{64}$/)
})
