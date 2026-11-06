// Sorting by column (src/front/StatusSort.ts), shared by every table. What is pinned: the three clicks,
// numbers as numbers, versions as people read them, and "unknown" always last in both directions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESortDirection } from '../../src/common/StatusTypes'
import { nextSort, sortRows, TSortValue } from '../../src/front/StatusSort'

interface IRow {
    id: string
    n?: number
    v?: string
}

const ROWS: IRow[] = [
    { id: 'b', n: 10, v: '0.10.0' },
    { id: 'a', n: 2, v: '0.9.0' },
    { id: 'c' },
    { id: 'D', n: 2, v: '1.0.0' }
]
const valueOf = (r: IRow, column: string): TSortValue => column === 'n' ? r.n : column === 'v' ? r.v : r.id
const ids = (rows: IRow[]) => rows.map(r => r.id)

test('🔴 three clicks: ascending, descending, then the table\'s own order', () => {
    const asc = nextSort(undefined, 'n')
    assert.deepEqual(asc, { column: 'n', direction: ESortDirection.ASC })
    const desc = nextSort(asc, 'n')
    assert.deepEqual(desc, { column: 'n', direction: ESortDirection.DESC })
    assert.equal(nextSort(desc, 'n'), undefined)
    // Another column starts over, ascending.
    assert.deepEqual(nextSort(desc, 'v'), { column: 'v', direction: ESortDirection.ASC })
})

test('without a sort, the SAME array: the table keeps its own order', () => {
    assert.equal(sortRows(ROWS, undefined, valueOf), ROWS)
})

test('numbers sort as numbers, not as text (10 after 2)', () => {
    assert.deepEqual(ids(sortRows(ROWS, { column: 'n', direction: ESortDirection.ASC }, valueOf)), ['a', 'D', 'b', 'c'])
})

test('🔴 unknown goes LAST in both directions', () => {
    assert.equal(ids(sortRows(ROWS, { column: 'n', direction: ESortDirection.ASC }, valueOf)).at(-1), 'c')
    assert.equal(ids(sortRows(ROWS, { column: 'n', direction: ESortDirection.DESC }, valueOf)).at(-1), 'c')
})

test('ties keep the table\'s own order (stable)', () => {
    // a and D both have 2: a came first in ROWS, and stays first.
    const sorted = ids(sortRows(ROWS, { column: 'n', direction: ESortDirection.ASC }, valueOf))
    assert.ok(sorted.indexOf('a') < sorted.indexOf('D'))
})

test('🔴 versions as people read them: 0.10.0 after 0.9.0', () => {
    assert.deepEqual(ids(sortRows(ROWS, { column: 'v', direction: ESortDirection.ASC }, valueOf)), ['a', 'b', 'D', 'c'])
})

test('text ignores case', () => {
    assert.deepEqual(ids(sortRows(ROWS, { column: 'id', direction: ESortDirection.ASC }, valueOf)), ['a', 'b', 'c', 'D'])
    assert.deepEqual(ids(sortRows(ROWS, { column: 'id', direction: ESortDirection.DESC }, valueOf)), ['D', 'c', 'b', 'a'])
})

test('it does not reorder the input', () => {
    sortRows(ROWS, { column: 'n', direction: ESortDirection.DESC }, valueOf)
    assert.deepEqual(ids(ROWS), ['b', 'a', 'c', 'D'])
})
