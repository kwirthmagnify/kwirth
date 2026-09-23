import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import zlib from 'zlib'
import { LoginManager } from '../../src/tools/LoginManager'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'

/*
    Actualizar una extension instalando ENCIMA, de punta a punta.

    El guardian se prueba suelto en extensionInstallGuard.test.ts; aqui lo que se comprueba es lo otro,
    que es donde esta el fallo silencioso: que lo que queda guardado despues de actualizar es EXACTAMENTE
    lo que trae el paquete nuevo, y no la suma de lo que fueron trayendo sus versiones.

    Los managers escriben cada artefacto en su propia clave y algunas escrituras eran condicionales —el
    front solo si cabia, el fondo solo si venia—. Saltarse una escritura no deja la clave vacia: la deja
    con el contenido de la version ANTERIOR. Es un fallo que no da error, no aparece en el indice y solo
    se nota cuando alguien se pregunta por que sigue viendo lo de antes.
*/

const almacenFalso = (limite?: number): IConfigMaps & { datos: Map<string, any> } => {
    const datos = new Map<string, any>()
    return {
        datos,
        storeLimit: () => limite,
        write: async (name: string, data: any) => {
            // null borra, que es como se quita una clave: si se guardara tal cual, un artefacto retirado
            // seguiria "existiendo" y el test pasaria sin que el borrado funcione de verdad.
            if (data === null) datos.delete(name)
            else datos.set(name, data)
            return {}
        },
        read: async (name: string, defaultValue?: any) => datos.get(name) ?? defaultValue,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

// ── logins ─────────────────────────────────────────────────────────────────────

/** Un tgz de login, con fondo o sin el. El png no es valido: aqui solo importa que ESTE. */
const construirLogin = async (id: string, version: string, conFondo: boolean): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-login-upd-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: `@test/login-${id}`, version, displayName: id }))
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify({ title: `${id} ${version}` }))
    const ficheros = ['package.json', 'login.json']
    if (conFondo) { fs.writeFileSync(path.join(dir, 'background.png'), Buffer.alloc(1024, 7)); ficheros.push('background.png') }
    const tgz = path.join(dir, `${id}-${version}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ficheros)
    return tgz
}

test('un login no se reinstala sin permiso, y con permiso se actualiza', async () => {
    const almacen = almacenFalso()
    const manager = new LoginManager(almacen)
    await manager.init()

    await manager.install(await construirLogin('acme', '1.0.0', true), 'test')
    await assert.rejects(
        manager.install(await construirLogin('acme', '2.0.0', true), 'test'),
        /is already installed/
    )
    await manager.install(await construirLogin('acme', '2.0.0', true), 'test', undefined, undefined, true)

    const guardado = almacen.datos.get('kwirth-login-acme')
    assert.equal(guardado.meta.version, '2.0.0')
    // y en el indice no hay dos entradas: se reemplaza, no se añade
    const indice = almacen.datos.get('kwirth-logins-index')
    assert.equal(indice.filter((m: { id: string }) => m.id === 'acme').length, 1)
    assert.equal(indice.find((m: { id: string }) => m.id === 'acme').version, '2.0.0')
})

test('si la version nueva de un login ya no trae fondo, el fondo viejo DESAPARECE', async () => {
    /*
        El caso concreto que hay que sostener: lo instalado refleja lo que trae la extension. Un login que
        deja de traer imagen tiene que quedarse sin imagen, no heredar la de la version anterior y seguir
        pintando un fondo que su paquete ya no incluye.
    */
    const almacen = almacenFalso()
    const manager = new LoginManager(almacen)
    await manager.init()

    await manager.install(await construirLogin('acme', '1.0.0', true), 'test')
    assert.ok(almacen.datos.get('kwirth-login-acme').background, 'la primera version si traia fondo')

    await manager.install(await construirLogin('acme', '1.1.0', false), 'test', undefined, undefined, true)

    const guardado = almacen.datos.get('kwirth-login-acme')
    assert.equal(guardado.meta.version, '1.1.0')
    assert.equal(guardado.background, undefined, 'el fondo de la version anterior sigue ahi')
    assert.equal(guardado.backgroundQuality, undefined)
})

// ── senders ────────────────────────────────────────────────────────────────────

/** Un tgz de sender. El front es opcional, que es justo lo que se quiere probar. */
const construirSender = async (id: string, version: string, conFront: boolean): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-sender-upd-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: `@test/sender-${id}`, version, displayName: id }))
    fs.writeFileSync(path.join(dir, 'back.js'), `module.exports = class { async send() { return { success: true, version: '${version}' } } }`)
    const ficheros = ['package.json', 'back.js']
    if (conFront) { fs.writeFileSync(path.join(dir, 'front.js'), `window.frontDe = '${version}'`); ficheros.push('front.js') }
    const tgz = path.join(dir, `${id}-${version}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ficheros)
    return tgz
}

test('si la version nueva de un sender ya no trae front, el front viejo DESAPARECE', async () => {
    const almacen = almacenFalso()
    const manager = new SenderManager(almacen)
    await manager.init()

    await manager.install(await construirSender('mail', '1.0.0', true), 'test')
    assert.ok(almacen.datos.get('kwirth-sender-mail-front'), 'la primera version si traia front')

    await manager.install(await construirSender('mail', '1.1.0', false), 'test', undefined, undefined, true)

    assert.equal(almacen.datos.get('kwirth-sender-mail-meta').version, '1.1.0')
    assert.equal(almacen.datos.get('kwirth-sender-mail-front'), undefined, 'el front de la version anterior sigue ahi')
})

test('y si la nueva SI lo trae, se queda el nuevo, no el de antes', async () => {
    // el reverso del anterior: borrar de mas seria igual de malo que no borrar
    const almacen = almacenFalso()
    const manager = new SenderManager(almacen)
    await manager.init()

    await manager.install(await construirSender('mail', '1.0.0', true), 'test')
    await manager.install(await construirSender('mail', '1.1.0', true), 'test', undefined, undefined, true)

    const guardado = almacen.datos.get('kwirth-sender-mail-front')
    assert.ok(guardado, 'se ha borrado un front que la version nueva si trae')
    const codigo = Buffer.from(guardado.code, 'base64')
    assert.match(zlib.gunzipSync(codigo).toString('utf-8'), /1\.1\.0/)
})

test('un sender tampoco baja de version, aunque se pida el permiso', async () => {
    const almacen = almacenFalso()
    const manager = new SenderManager(almacen)
    await manager.init()

    await manager.install(await construirSender('mail', '2.0.0', false), 'test')
    await assert.rejects(
        manager.install(await construirSender('mail', '1.0.0', false), 'test', undefined, undefined, true),
        /is not newer/
    )
    // y lo instalado no se ha tocado
    assert.equal(almacen.datos.get('kwirth-sender-mail-meta').version, '2.0.0')
})
