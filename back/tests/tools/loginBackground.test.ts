import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundProblem, pickBackground, EBackgroundQuality, CONFIGMAP_SIZE_LIMIT } from '../../src/tools/LoginManager'

// A login can end up HALF installed: its background.png does not fit in the ConfigMap — a hard limit of
// ~1 MiB per object in Kubernetes, and the image travels inside it as base64 — and the page comes out with
// no background. Until now that was only a line in the log: it really happened with a login installed from
// the marketplace, it looked different from how its author designed it, and nobody had any way of knowing why.
//
// It is now recorded on the login itself so its page can say so. This test pins down WHERE the boundary is.

const b64 = (n: number) => 'x'.repeat(n)

test('un fondo que cabe no es ningun problema', () => {
    assert.equal(backgroundProblem(b64(CONFIGMAP_SIZE_LIMIT)), undefined)
})

test('un solo caracter por encima del tope ya lo es', () => {
    assert.equal(backgroundProblem(b64(CONFIGMAP_SIZE_LIMIT + 1)), 'background-too-large')
})

test('no traer fondo NO es un problema: un login puede no tenerlo', () => {
    assert.equal(backgroundProblem(undefined), undefined)
})

test('un fondo vacio tampoco: no hay nada que no quepa', () => {
    assert.equal(backgroundProblem(''), undefined)
})

test('el tope se mide sobre el BASE64, que es lo que se guarda, no sobre el png', () => {
    // 600 KB of png is ~800 KB in base64: the raw image would fit and the encoded one would not. Measuring
    // the png would let through backgrounds the ConfigMap later rejects.
    const rawBytes = 620 * 1024
    const encodedLength = Math.ceil(rawBytes / 3) * 4
    assert.ok(encodedLength > CONFIGMAP_SIZE_LIMIT, 'la codificacion crece ~4/3: el margen hay que tomarlo ahi')
    assert.equal(backgroundProblem(b64(encodedLength)), 'background-too-large')
})

/*
    TWO backgrounds: `background-hi.png` (the good one) and `background.png` (the one that fits anywhere).

    Which one is stored is not decided by the login: it is decided by WHERE it is going to be stored. On
    Kubernetes without file storage there is ~1 MiB per ConfigMap; on desktop, docker or with KWIRTH_STORE
    it is written to disk and there is no such ceiling. Hence the limit may be `undefined`, which means
    "everything fits", not "it is not known".
*/

const HI = b64(900 * 1024)      // does not fit in a ConfigMap
const STD = b64(300 * 1024)     // fits anywhere

test('sin tope gana la buena: es el caso de desktop, docker y KWIRTH_STORE', () => {
    const elegido = pickBackground(HI, STD, undefined)
    assert.equal(elegido.quality, EBackgroundQuality.HI)
    assert.equal(elegido.backgroundB64, HI)
    assert.equal(elegido.problem, undefined)
})

test('con el tope de un ConfigMap, la buena no cabe y se cae a la normal', () => {
    const elegido = pickBackground(HI, STD, CONFIGMAP_SIZE_LIMIT)
    assert.equal(elegido.quality, EBackgroundQuality.STANDARD)
    assert.equal(elegido.backgroundB64, STD)
    assert.equal(elegido.problem, undefined, 'caer a la normal NO es un problema: es el plan')
})

test('si la buena cabe, se usa aunque haya tope', () => {
    const cabeJusto = b64(CONFIGMAP_SIZE_LIMIT)
    assert.equal(pickBackground(cabeJusto, STD, CONFIGMAP_SIZE_LIMIT).quality, EBackgroundQuality.HI)
})

test('si NINGUNA cabe, no se guarda nada y queda el problema — como antes de todo esto', () => {
    const elegido = pickBackground(HI, b64(850 * 1024), CONFIGMAP_SIZE_LIMIT)
    assert.equal(elegido.backgroundB64, undefined)
    assert.equal(elegido.quality, undefined)
    assert.equal(elegido.problem, 'background-too-large')
})

test('un login con SOLO la buena sigue valiendo donde quepa', () => {
    assert.equal(pickBackground(HI, undefined, undefined).quality, EBackgroundQuality.HI)
    assert.equal(pickBackground(HI, undefined, CONFIGMAP_SIZE_LIMIT).problem, 'background-too-large')
})

test('un login con SOLO la normal se comporta igual que siempre', () => {
    assert.equal(pickBackground(undefined, STD, CONFIGMAP_SIZE_LIMIT).quality, EBackgroundQuality.STANDARD)
})

test('sin ninguna imagen no hay ni fondo ni problema', () => {
    assert.deepEqual(pickBackground(undefined, undefined, CONFIGMAP_SIZE_LIMIT), {})
    assert.deepEqual(pickBackground(undefined, undefined, undefined), {})
})
