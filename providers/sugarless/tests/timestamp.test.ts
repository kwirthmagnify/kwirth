import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLibreTimestamp } from '../src/common/Timestamp'

/*
    El parseo del FactoryTimestamp es el punto mas delicado del provider: si se equivoca no lanza, solo
    dibuja la curva mal. De ahi que sea lo que mas casos tiene.
*/

test('parses the verified format as UTC, not as local time', () => {
    // 7:19:21 AM UTC del 4 de julio de 2026
    const epoch = parseLibreTimestamp('7/4/2026 7:19:21 AM')
    assert.equal(epoch, Date.UTC(2026, 6, 4, 7, 19, 21))

    // Y se comprueba explicitamente que NO se ha interpretado en la zona de la maquina, que es el
    // error que dejaria la grafica desplazada segun donde corra kwirth.
    const asUtcString = new Date(epoch!).toISOString()
    assert.equal(asUtcString, '2026-07-04T07:19:21.000Z')
})

test('reads the month first, American style', () => {
    // 3/4 es el 4 de marzo, no el 3 de abril
    assert.equal(parseLibreTimestamp('3/4/2026 1:00:00 PM'), Date.UTC(2026, 2, 4, 13, 0, 0))
})

test('12 AM is midnight and 12 PM is noon', () => {
    assert.equal(parseLibreTimestamp('1/1/2026 12:00:00 AM'), Date.UTC(2026, 0, 1, 0, 0, 0))
    assert.equal(parseLibreTimestamp('1/1/2026 12:30:45 PM'), Date.UTC(2026, 0, 1, 12, 30, 45))
})

test('converts the rest of the PM hours by adding twelve', () => {
    assert.equal(parseLibreTimestamp('1/1/2026 1:00:00 PM'), Date.UTC(2026, 0, 1, 13, 0, 0))
    assert.equal(parseLibreTimestamp('1/1/2026 11:59:59 PM'), Date.UTC(2026, 0, 1, 23, 59, 59))
})

test('accepts lowercase and extra spacing in the meridiem', () => {
    assert.equal(parseLibreTimestamp('1/1/2026 9:05:00 pm'), Date.UTC(2026, 0, 1, 21, 5, 0))
    assert.equal(parseLibreTimestamp('1/1/2026 9:05:00pm'), Date.UTC(2026, 0, 1, 21, 5, 0))
})

test('accepts two digit months and days', () => {
    assert.equal(parseLibreTimestamp('12/25/2026 6:07:08 AM'), Date.UTC(2026, 11, 25, 6, 7, 8))
})

test('accepts a 24 hour variant without meridiem', () => {
    assert.equal(parseLibreTimestamp('7/4/2026 19:19:21'), Date.UTC(2026, 6, 4, 19, 19, 21))
    assert.equal(parseLibreTimestamp('7/4/2026 00:00:00'), Date.UTC(2026, 6, 4, 0, 0, 0))
})

test('trims surrounding whitespace', () => {
    assert.equal(parseLibreTimestamp('  7/4/2026 7:19:21 AM  '), Date.UTC(2026, 6, 4, 7, 19, 21))
})

test('rejects dates that do not exist instead of silently shifting them', () => {
    // Date.UTC convertiria el 31 de febrero en marzo sin protestar: eso colaria una muestra
    // desplazada varios dias, que es peor que perderla.
    assert.equal(parseLibreTimestamp('2/31/2026 1:00:00 AM'), undefined)
    assert.equal(parseLibreTimestamp('4/31/2026 1:00:00 AM'), undefined)
    assert.equal(parseLibreTimestamp('13/1/2026 1:00:00 AM'), undefined)
    assert.equal(parseLibreTimestamp('1/0/2026 1:00:00 AM'), undefined)
})

test('accepts the 29th of February on a leap year and rejects it otherwise', () => {
    assert.equal(parseLibreTimestamp('2/29/2028 1:00:00 AM'), Date.UTC(2028, 1, 29, 1, 0, 0))
    assert.equal(parseLibreTimestamp('2/29/2026 1:00:00 AM'), undefined)
})

test('rejects out of range times', () => {
    assert.equal(parseLibreTimestamp('1/1/2026 13:00:00 PM'), undefined)
    assert.equal(parseLibreTimestamp('1/1/2026 0:00:00 AM'), undefined)
    assert.equal(parseLibreTimestamp('1/1/2026 1:60:00 AM'), undefined)
    assert.equal(parseLibreTimestamp('1/1/2026 1:00:60 AM'), undefined)
    assert.equal(parseLibreTimestamp('7/4/2026 24:00:00'), undefined)
})

test('rejects anything that is not the expected shape', () => {
    assert.equal(parseLibreTimestamp('2026-07-04T07:19:21Z'), undefined)
    assert.equal(parseLibreTimestamp('7/4/2026'), undefined)
    assert.equal(parseLibreTimestamp('7/4/26 7:19:21 AM'), undefined)
    assert.equal(parseLibreTimestamp('not a date'), undefined)
    assert.equal(parseLibreTimestamp(''), undefined)
    assert.equal(parseLibreTimestamp('   '), undefined)
    assert.equal(parseLibreTimestamp(undefined), undefined)
    assert.equal(parseLibreTimestamp(null), undefined)
})

test('the two fields of a real reading differ by the local offset', () => {
    // Comprobacion del hallazgo que motivo usar FactoryTimestamp: las dos marcas de la misma lectura
    // se separan exactamente el offset de la zona del paciente (aqui 2 h, España en verano).
    const utc = parseLibreTimestamp('7/4/2026 7:19:21 AM')
    const local = parseLibreTimestamp('7/4/2026 9:19:21 AM')
    assert.equal(local! - utc!, 2 * 60 * 60 * 1000)
})
