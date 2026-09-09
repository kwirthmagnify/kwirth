import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundProblem, CONFIGMAP_SIZE_LIMIT } from '../../src/tools/LoginManager'

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
