// Every record type ends up as text, and the text is the canonical one: the order of fields a zone
// file uses, so a consumer that wants the pieces back can split it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMx, formatSoa, formatSrv, formatTxt } from '../src/back/dnsFormat'

test('MX keeps the priority in front, and the order it was answered in', () => {
    assert.deepEqual(
        formatMx([{ priority: 10, exchange: 'mail.example.com' }, { priority: 20, exchange: 'backup.example.com' }]),
        ['10 mail.example.com', '20 backup.example.com']
    )
})

test('🔴 a NULL MX (RFC 7505) comes out as `0 .`, never as a priority with a trailing space', () => {
    // example.com really answers this: a domain that takes no mail. Node gives an empty exchange.
    assert.deepEqual(formatMx([{ priority: 0, exchange: '' }]), ['0 .'])
})

test('SRV is priority, weight, port and target, in that order', () => {
    assert.deepEqual(
        formatSrv([{ priority: 0, weight: 5, port: 5060, name: 'sip.example.com' }]),
        ['0 5 5060 sip.example.com']
    )
})

test('🔴 a TXT split into chunks comes back joined: the 255-byte limit is transport, not content', () => {
    assert.deepEqual(formatTxt([['v=spf1 ', 'include:_spf.example.com ', '~all']]), ['v=spf1 include:_spf.example.com ~all'])
    assert.deepEqual(formatTxt([['one'], ['two']]), ['one', 'two'])
})

test('SOA is one record with its seven fields', () => {
    assert.deepEqual(
        formatSoa({ nsname: 'ns1.example.com', hostmaster: 'hostmaster.example.com', serial: 2026092901, refresh: 7200, retry: 3600, expire: 1209600, minttl: 300 }),
        ['ns1.example.com hostmaster.example.com 2026092901 7200 3600 1209600 300']
    )
})

test('an empty answer formats to an empty list, not to a list with an empty string', () => {
    assert.deepEqual(formatMx([]), [])
    assert.deepEqual(formatSrv([]), [])
    assert.deepEqual(formatTxt([]), [])
})
