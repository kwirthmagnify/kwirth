import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEvent, ESugarlessStatus, lastSample, SugarlessData } from '../src/front/SugarlessData'
import {
    EGlucoseUnit, ESugarlessErrorKind, ESugarlessPayload, ETrendArrow, IGlucoseSample, trendArrow
} from '../src/common/SugarlessTypes'

/*
    El reductor es la unica logica del plugin: decidir QUE ve el usuario cuando no hay curva. Los
    cuatro estados vacios se confunden con facilidad, y confundirlos es justo lo que hace que alguien
    se quede mirando una pantalla sin saber si tiene que llamar al administrador o esperar.
*/

const sample = (timestamp: number, value = 112, overrides: Partial<IGlucoseSample> = {}): IGlucoseSample => ({
    timestamp,
    value,
    trend: ETrendArrow.STABLE,
    isHigh: false,
    isLow: false,
    ...overrides
})

test('a snapshot with readings fills the window and leaves the tab in OK', () => {
    const data = new SugarlessData()
    const changed = applyEvent(data, {
        payloadType: ESugarlessPayload.SNAPSHOT,
        unit: EGlucoseUnit.MGDL,
        samples: [sample(1000), sample(2000, 118)],
        targetLow: 70,
        targetHigh: 150
    })

    assert.equal(changed, true)
    assert.equal(data.samples.length, 2)
    assert.equal(data.status, ESugarlessStatus.OK)
    assert.equal(data.targetLow, 70)
    assert.equal(data.targetHigh, 150)
    assert.equal(data.unit, EGlucoseUnit.MGDL)
})

test('an EMPTY snapshot is "waiting", not an error', () => {
    // Es el caso de abrir la pestaña recien configurado: el provider aun no ha leido nada.
    const data = new SugarlessData()
    applyEvent(data, { payloadType: ESugarlessPayload.SNAPSHOT, unit: EGlucoseUnit.MGDL, samples: [] })

    assert.equal(data.samples.length, 0)
    assert.equal(data.status, ESugarlessStatus.WAITING)
    assert.equal(data.statusMessage, '')
})

test('a snapshot REPLACES the window instead of appending to it', () => {
    // Si se acumulara, reconectar duplicaria toda la serie y la grafica saldria con el doble de puntos.
    const data = new SugarlessData()
    applyEvent(data, { payloadType: ESugarlessPayload.SNAPSHOT, unit: EGlucoseUnit.MGDL, samples: [sample(1000), sample(2000)] })
    applyEvent(data, { payloadType: ESugarlessPayload.SNAPSHOT, unit: EGlucoseUnit.MGDL, samples: [sample(3000)] })

    assert.equal(data.samples.length, 1)
    assert.equal(data.samples[0].timestamp, 3000)
})

test('a sample is appended at the end and becomes the latest', () => {
    const data = new SugarlessData()
    applyEvent(data, { payloadType: ESugarlessPayload.SNAPSHOT, unit: EGlucoseUnit.MGDL, samples: [sample(1000, 100)] })
    applyEvent(data, { payloadType: ESugarlessPayload.SAMPLE, unit: EGlucoseUnit.MGDL, sample: sample(2000, 133) })

    assert.equal(data.samples.length, 2)
    assert.equal(lastSample(data)!.value, 133)
    assert.equal(data.status, ESugarlessStatus.OK)
})

test('a sample event with no sample changes nothing', () => {
    const data = new SugarlessData()
    const changed = applyEvent(data, { payloadType: ESugarlessPayload.SAMPLE, unit: EGlucoseUnit.MGDL })

    assert.equal(changed, false)
    assert.equal(data.samples.length, 0)
})

test('NO_DATA is its own state and never says "error"', () => {
    const data = new SugarlessData()
    applyEvent(data, {
        payloadType: ESugarlessPayload.NO_DATA,
        unit: EGlucoseUnit.MGDL,
        error: 'The connection is fine, but there is no current reading.'
    })

    assert.equal(data.status, ESugarlessStatus.NO_DATA)
    assert.notEqual(data.status, ESugarlessStatus.ERROR)
    assert.match(data.statusMessage, /no current reading/i)
})

test('a missing credentials error gets its own state, not the generic error', () => {
    // Se separa porque la accion del usuario es distinta: esto lo arregla un administrador, no espera.
    const data = new SugarlessData()
    applyEvent(data, {
        payloadType: ESugarlessPayload.ERROR,
        unit: EGlucoseUnit.MGDL,
        errorKind: ESugarlessErrorKind.NOT_CONFIGURED,
        error: 'No credentials configured'
    })

    assert.equal(data.status, ESugarlessStatus.NOT_CONFIGURED)
    assert.match(data.statusMessage, /administrator/i)
})

test('every error kind produces an explanation, not just the raw message', () => {
    for (const kind of Object.values(ESugarlessErrorKind)) {
        const data = new SugarlessData()
        applyEvent(data, { payloadType: ESugarlessPayload.ERROR, unit: EGlucoseUnit.MGDL, errorKind: kind, error: 'raw' })
        assert.ok(data.statusMessage.length > 'raw'.length, `el motivo '${kind}' no añade explicacion: '${data.statusMessage}'`)
    }
})

test('the follower problem is explained, because it is the most likely one', () => {
    const data = new SugarlessData()
    applyEvent(data, {
        payloadType: ESugarlessPayload.ERROR,
        unit: EGlucoseUnit.MGDL,
        errorKind: ESugarlessErrorKind.NO_FOLLOWED_PATIENT
    })

    assert.match(data.statusMessage, /does not follow any patient/i)
    assert.match(data.statusMessage, /shared/i)
})

test('a reading after an error clears the error', () => {
    const data = new SugarlessData()
    applyEvent(data, { payloadType: ESugarlessPayload.ERROR, unit: EGlucoseUnit.MGDL, errorKind: ESugarlessErrorKind.NETWORK })
    applyEvent(data, { payloadType: ESugarlessPayload.SAMPLE, unit: EGlucoseUnit.MGDL, sample: sample(1000) })

    assert.equal(data.status, ESugarlessStatus.OK)
    assert.equal(data.statusMessage, '')
})

test('the unit is respected and never converted', () => {
    const data = new SugarlessData()
    applyEvent(data, {
        payloadType: ESugarlessPayload.SNAPSHOT,
        unit: EGlucoseUnit.MMOLL,
        samples: [sample(1000, 6.2)],
        targetLow: 3.9,
        targetHigh: 8.3
    })

    assert.equal(data.unit, EGlucoseUnit.MMOLL)
    assert.equal(data.samples[0].value, 6.2)
    assert.equal(data.targetLow, 3.9)
})

test('an undefined event is ignored', () => {
    const data = new SugarlessData()
    assert.equal(applyEvent(data, undefined), false)
})

test('every trend has its own glyph, and stable points sideways', () => {
    // Una flecha equivocada en una grafica de glucosa no es un detalle estetico.
    assert.equal(trendArrow(ETrendArrow.STABLE), '→')
    assert.equal(trendArrow(ETrendArrow.FALLING_FAST), '↓')
    assert.equal(trendArrow(ETrendArrow.RISING_FAST), '↑')

    const glyphs = [
        ETrendArrow.FALLING_FAST, ETrendArrow.FALLING, ETrendArrow.STABLE,
        ETrendArrow.RISING, ETrendArrow.RISING_FAST
    ].map(trendArrow)
    assert.equal(new Set(glyphs).size, 5, 'dos tendencias distintas comparten glifo')
})

test('lastSample is undefined while there is nothing', () => {
    assert.equal(lastSample(new SugarlessData()), undefined)
})
