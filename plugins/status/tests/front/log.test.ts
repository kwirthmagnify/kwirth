// The Log tabs' logic (src/front/StatusLog.ts), moved from the About dialog: the ANSI colours the core
// writes, who may read the log, and what the Home says about the previous container — an unknown must
// never come out as "no restarts".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANSI_COLOUR, ansiSegments, isAdmin, previousSummary } from '../../src/front/StatusLog'
import { IStatusPreviousLog } from '../../src/common/StatusTypes'

const ESC = '\x1b'

test('🔴 the escapes never reach the text: colours become segments', () => {
    const segments = ansiSegments(`${ESC}[90m10:00:01${ESC}[0m ${ESC}[36minfo${ESC}[0m started`)
    assert.equal(segments.map(s => s.text).join(''), '10:00:01 info started')
    assert.equal(segments.some(s => s.text.includes(ESC)), false)
    assert.deepEqual(segments.filter(s => s.colour).map(s => [s.text, s.colour]), [
        ['10:00:01', ANSI_COLOUR['90']],
        ['info', ANSI_COLOUR['36']]
    ])
})

test('several codes in one escape: the last colour paints, and 0 resets', () => {
    const segments = ansiSegments(`${ESC}[0;31mboom${ESC}[0m after`)
    assert.deepEqual(segments, [{ text: 'boom', colour: ANSI_COLOUR['31'] }, { text: ' after' }])
})

test('an escape that is not a colour is dropped, not shown and not guessed', () => {
    assert.equal(ansiSegments(`a${ESC}[2Kb`).map(s => s.text).join(''), 'ab')
})

test('a line without colours is one plain segment', () => {
    assert.deepEqual(ansiSegments('plain line'), [{ text: 'plain line' }])
})

test('🔴 only an access key with the admin scope may read the log', () => {
    assert.equal(isAdmin('id|permanent|cluster,admin::::'), true)
    assert.equal(isAdmin('id|permanent|cluster::::'), false)
    assert.equal(isAdmin(undefined), false)
    assert.equal(isAdmin(''), false)
    // Something that is not an access key is not an admin, and does not blow up.
    assert.equal(isAdmin('garbage'), false)
})

const previous = (over: Partial<IStatusPreviousLog>): IStatusPreviousLog =>
    ({ restarted: true, abnormal: false, restartCount: 1, lines: [], ...over })

test('🔴 an unknown is never said as "no restarts"', () => {
    for (const s of [previousSummary(false, undefined), previousSummary(true, undefined), previousSummary(true, { error: 'HTTP 500' })]) {
        assert.equal(s.headline, '—')
        assert.equal(s.abnormal, false)
    }
    assert.match(previousSummary(true, { error: 'HTTP 500' }).detail, /HTTP 500/)
})

test('no restart, restarts, and an abnormal exit with its code', () => {
    assert.equal(previousSummary(true, { log: previous({ restarted: false, restartCount: 0 }) }).headline, 'No restarts')
    const clean = previousSummary(true, { log: previous({ restartCount: 3 }) })
    assert.deepEqual([clean.headline, clean.abnormal], ['3 restarts', false])
    const bad = previousSummary(true, { log: previous({ abnormal: true, termination: { exitCode: 137 } }) })
    assert.deepEqual([bad.headline, bad.abnormal], ['1 restart', true])
    assert.match(bad.detail, /exit code 137/)
})
