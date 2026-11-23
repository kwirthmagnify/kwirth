// The pure helpers of the table toolbar (0.5.81), against the built package: `npm run build` first, then `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { filterRows, rowCountLabel, TableToolbar, TABLE_TOOLBAR_HEIGHT } = require('../dist/index.js')

const rows = [{ p: 'alice session expired', k: 'New' }, { p: 'disk full', k: 'Missing' }, { p: 'ALICE password changed', k: undefined }]
const texts = r => [r.p, r.k]

test('filterRows: an empty filter, or only spaces, keeps every row', () => {
    assert.equal(filterRows(rows, '', texts).length, 3)
    assert.equal(filterRows(rows, '   ', texts).length, 3)
})

test('filterRows: any case, trimmed, in any of the texts; an undefined text is no match', () => {
    assert.deepEqual(filterRows(rows, '  Alice ', texts).map(r => r.p), ['alice session expired', 'ALICE password changed'])
    assert.deepEqual(filterRows(rows, 'missing', texts).map(r => r.p), ['disk full'])
    assert.deepEqual(filterRows(rows, 'nothing like it', texts), [])
    assert.deepEqual(filterRows([], 'x', texts), [])
})

test('rowCountLabel: rows, one row, and how many a filter leaves', () => {
    assert.equal(rowCountLabel(3, 3), '3 rows')
    assert.equal(rowCountLabel(1, 1), '1 row')
    assert.equal(rowCountLabel(0, 0), '0 rows')
    assert.equal(rowCountLabel(2, 3), '2 of 3 rows')
    assert.equal(rowCountLabel(0, 1), '0 of 1 row')
})

test('exported for plugins: the component and its height', () => {
    assert.equal(typeof TableToolbar, 'function')
    assert.equal(TABLE_TOOLBAR_HEIGHT, 40)
})
