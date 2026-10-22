import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESignupStatus, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { buildSignupMessage, signupSenderOf } from '../../../src/tools/auth/SignupNotice'

/*
    The notice of a new signup request (plan: plans/signup, S4): what it says, and when nobody is told.
*/

const request = (over: Partial<ISignupRequest> = {}): ISignupRequest => ({
    id: 'jane.doe@example.com', idp: 'google', name: 'Jane Doe', comment: 'platform team',
    requestedAt: 1_760_000_000_000, status: ESignupStatus.PENDING, ...over
})

test('el mensaje dice quien, por que IdP, por que, y donde revisarlo', () => {
    const m = buildSignupMessage(request(), 'Login with Google')
    assert.match(m.subject!, /jane\.doe@example\.com/)
    assert.match(m.body, /Jane Doe \(jane\.doe@example\.com\)/)
    assert.match(m.body, /through Login with Google/)
    assert.match(m.body, /"platform team"/)
    assert.match(m.body, /User security → Access requests/)
    assert.equal(m.level, 'info')
    assert.deepEqual(m.metadata, { signup: { id: 'jane.doe@example.com', idp: 'google', name: 'Jane Doe', requestedAt: 1_760_000_000_000 } })
})

test('sin comentario no sale un "Why" vacio', () => {
    const m = buildSignupMessage(request({ comment: undefined }), 'Login with Google')
    assert.doesNotMatch(m.body, /Why/)
})

test('signupSenderOf: el par completo, o nadie — medio par no entrega en ningun sitio', () => {
    assert.deepEqual(signupSenderOf({ signupSenderId: 'teams', signupSenderConfigName: 'admins' }), { senderId: 'teams', configName: 'admins' })
    assert.equal(signupSenderOf({}), undefined)
    assert.equal(signupSenderOf({ signupSenderId: 'teams' }), undefined)
    assert.equal(signupSenderOf({ signupSenderId: 'teams', signupSenderConfigName: '' }), undefined)
    assert.equal(signupSenderOf({ signupSenderId: '', signupSenderConfigName: 'admins' }), undefined)
})
