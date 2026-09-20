import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundProblem, pickBackground, EBackgroundQuality, CONFIGMAP_SIZE_LIMIT } from '../../src/tools/LoginManager'

// Un login puede quedar instalado A MEDIAS: su background.png no cabe en el ConfigMap —tope duro de ~1 MiB
// por objeto en Kubernetes, y la imagen viaja dentro en base64— y la pagina sale sin fondo. Hasta ahora eso
// era solo una linea de log: paso de verdad con un login instalado desde el marketplace, se veia distinto
// de como lo diseño su autor, y nadie tenia forma de saber por que.
//
// Ahora se anota en el propio login para que su pagina lo diga. Este test fija DONDE esta la frontera.

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
    // 600 KB de png son ~800 KB en base64: la imagen cruda cabria y la codificada no. Medir el png seria
    // dejar pasar fondos que luego el ConfigMap rechaza.
    const rawBytes = 620 * 1024
    const encodedLength = Math.ceil(rawBytes / 3) * 4
    assert.ok(encodedLength > CONFIGMAP_SIZE_LIMIT, 'la codificacion crece ~4/3: el margen hay que tomarlo ahi')
    assert.equal(backgroundProblem(b64(encodedLength)), 'background-too-large')
})

/*
    DOS fondos: `background-hi.png` (la buena) y `background.png` (la que cabe en cualquier sitio).

    Cual se guarda no lo decide el login: lo decide DONDE va a guardarse. En Kubernetes sin almacenamiento
    de fichero hay ~1 MiB por ConfigMap; en desktop, docker o con KWIRTH_STORE se escribe en disco y no hay
    ese techo. De ahi que el limite pueda ser `undefined`, que significa "cabe todo", no "no se sabe".
*/

const HI = b64(900 * 1024)      // no cabe en un ConfigMap
const STD = b64(300 * 1024)     // cabe en cualquier sitio

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
