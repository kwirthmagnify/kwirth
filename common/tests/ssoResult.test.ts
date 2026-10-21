import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESsoResult } from '../src/AuthMethod'
import { ESignupStatus } from '../src/Signup'

/*
    The values of ESsoResult travel in the URL (`?ssoerror=<value>`) from a back end to a front end that
    may be of another version. They were plain strings before the enum, and these are those strings: a
    rename here is a front end that shows "Single Sign-On failed (xyz)" instead of the real reason.
*/
test('ESsoResult keeps the strings the callback has always emitted', () => {
    assert.equal(ESsoResult.UNAVAILABLE, 'unavailable')
    assert.equal(ESsoResult.STATE, 'state')
    assert.equal(ESsoResult.CALLBACK, 'callback')
    assert.equal(ESsoResult.UNVERIFIED, 'unverified')
    assert.equal(ESsoResult.NOTFOUND, 'notfound')
    assert.equal(ESsoResult.IDPMISMATCH, 'idpmismatch')
    assert.equal(ESsoResult.ISSUE, 'issue')
})

test('ESsoResult adds the three signup outcomes, all distinct', () => {
    assert.equal(ESsoResult.PENDING, 'pending')
    assert.equal(ESsoResult.REJECTED, 'rejected')
    assert.equal(ESsoResult.SIGNUPLIMIT, 'signuplimit')
    const values = Object.values(ESsoResult)
    assert.equal(new Set(values).size, values.length)
})

test('ESignupStatus is persisted: its values are the stored strings', () => {
    assert.equal(ESignupStatus.PENDING, 'pending')
    assert.equal(ESignupStatus.REJECTED, 'rejected')
})
