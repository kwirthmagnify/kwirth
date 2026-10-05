import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LogBuffer } from '../../src/tools/LogBuffer'

/*
    The ring buffer that captures the core's stdout when there is no Kubernetes API.

    The singleton (coreLogBuffer) is not tested directly: it has been accumulating lines since the process
    started and its contents depend on what every other test wrote. The class is tested instead — it is
    the contract, and the singleton is just one instance of it.
*/

test('holds the last N lines in order', () => {
    const buf = new LogBuffer(5)
    for (let i = 1; i <= 3; i++) buf.add(`line ${i}`)
    assert.deepEqual(buf.getLines(), ['line 1', 'line 2', 'line 3'])
})

test('overwrites the oldest lines when full', () => {
    const buf = new LogBuffer(3)
    for (let i = 1; i <= 5; i++) buf.add(`line ${i}`)
    // Only the last 3 survive.
    assert.deepEqual(buf.getLines(), ['line 3', 'line 4', 'line 5'])
})

test('splits multi-line input into individual lines', () => {
    const buf = new LogBuffer(10)
    buf.add('first\nsecond\nthird')
    assert.deepEqual(buf.getLines(), ['first', 'second', 'third'])
})

test('getLines(count) returns at most count lines', () => {
    const buf = new LogBuffer(10)
    for (let i = 1; i <= 5; i++) buf.add(`line ${i}`)
    assert.deepEqual(buf.getLines(2), ['line 4', 'line 5'])
})

test('getLines(0) returns an empty array without clearing the buffer', () => {
    const buf = new LogBuffer(10)
    buf.add('something')
    assert.deepEqual(buf.getLines(0), [])
    assert.deepEqual(buf.getLines(), ['something'])
})

test('a buffer of size 1 keeps only the last line', () => {
    const buf = new LogBuffer(1)
    buf.add('a')
    buf.add('b')
    assert.deepEqual(buf.getLines(), ['b'])
})
