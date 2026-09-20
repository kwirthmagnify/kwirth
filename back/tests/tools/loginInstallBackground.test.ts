import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { LoginManager, EBackgroundQuality } from '../../src/tools/LoginManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'

/*
    La instalacion de un login con DOS fondos, de punta a punta.

    Lo que `pickBackground` decide en abstracto, aqui se comprueba sobre el flujo real: se construye un tgz
    con las dos imagenes y se instala contra un almacenamiento de mentira, una vez declarando el tope de un
    ConfigMap de Kubernetes y otra sin tope (fichero). Lo que cambia entre las dos NO es el login: es donde
    se guarda.

    Sin esto, la eleccion podria estar bien y el install seguir leyendo solo `background.png` — que es
    justo el fallo que introduciria un despiste al cablearlo.
*/

/** Almacenamiento en memoria que declara el tope que se le diga. */
const almacenFalso = (limite: number | undefined): IConfigMaps & { datos: Map<string, any> } => {
    const datos = new Map<string, any>()
    return {
        datos,
        storeLimit: () => limite,
        write: async (name: string, data: any) => { datos.set(name, data); return {} },
        read: async (name: string, defaultValue?: any) => datos.get(name) ?? defaultValue,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

/** Un tgz de login con las imagenes que se le pidan. El png no es valido: aqui solo importa su TAMAÑO. */
const construirLogin = async (id: string, imagenes: { std?: number, hi?: number }): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-login-test-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: `@test/login-${id}`, version: '1.0.0', displayName: id }))
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify({ title: id }))
    const ficheros = ['package.json', 'login.json']
    if (imagenes.std !== undefined) { fs.writeFileSync(path.join(dir, 'background.png'), Buffer.alloc(imagenes.std, 1)); ficheros.push('background.png') }
    if (imagenes.hi !== undefined) { fs.writeFileSync(path.join(dir, 'background-hi.png'), Buffer.alloc(imagenes.hi, 2)); ficheros.push('background-hi.png') }
    const tgz = path.join(dir, `${id}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ficheros)
    return tgz
}

/** Instala y devuelve lo que quedo guardado del login. */
const instalar = async (limite: number | undefined, imagenes: { std?: number, hi?: number }) => {
    const almacen = almacenFalso(limite)
    const manager = new LoginManager(almacen)
    await manager.init()
    const tgz = await construirLogin('bgtest', imagenes)
    const meta = await manager.install(tgz, 'test')
    return almacen.datos.get(`kwirth-login-${meta.id}`) as { background?: string, backgroundQuality?: EBackgroundQuality, problem?: string }
}

const KB = 1024
const TOPE_CONFIGMAP = 800 * KB

// 700 KB de png son ~933 KB en base64: NO caben. 300 KB son ~400 KB: si.
const HI_QUE_NO_CABE = 700 * KB
const STD_QUE_CABE = 300 * KB

test('en fichero (sin tope) se guarda la BUENA', async () => {
    const guardado = await instalar(undefined, { std: STD_QUE_CABE, hi: HI_QUE_NO_CABE })
    assert.equal(guardado.backgroundQuality, EBackgroundQuality.HI)
    assert.equal(guardado.problem, undefined)
    // y es de verdad la grande, no la otra: el relleno las distingue
    assert.ok(Buffer.from(guardado.background!, 'base64').length === HI_QUE_NO_CABE)
})

test('en un ConfigMap la buena no cabe y se guarda la NORMAL, sin marcar problema', async () => {
    const guardado = await instalar(TOPE_CONFIGMAP, { std: STD_QUE_CABE, hi: HI_QUE_NO_CABE })
    assert.equal(guardado.backgroundQuality, EBackgroundQuality.STANDARD)
    assert.equal(guardado.problem, undefined)
    assert.ok(Buffer.from(guardado.background!, 'base64').length === STD_QUE_CABE)
})

test('si la buena cabe en el ConfigMap, se usa la buena', async () => {
    const guardado = await instalar(TOPE_CONFIGMAP, { std: 100 * KB, hi: 400 * KB })
    assert.equal(guardado.backgroundQuality, EBackgroundQuality.HI)
})

test('si no cabe ninguna, no se guarda nada y el login queda marcado — como antes', async () => {
    const guardado = await instalar(TOPE_CONFIGMAP, { std: 700 * KB, hi: 900 * KB })
    assert.equal(guardado.background, undefined)
    assert.equal(guardado.backgroundQuality, undefined)
    assert.equal(guardado.problem, 'background-too-large')
})

test('un login SIN fondos se instala igual, y sin problema', async () => {
    const guardado = await instalar(TOPE_CONFIGMAP, {})
    assert.equal(guardado.background, undefined)
    assert.equal(guardado.problem, undefined)
})
