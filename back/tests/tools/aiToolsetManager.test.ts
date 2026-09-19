import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AiToolsetManager, staleDevAiToolsets, IAiToolsetMeta } from '../../src/tools/AiToolsetManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { registerToolset, getToolset, listToolsets, isToolsetGrantedTo, getToolsetGrants } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity, ECapability } from '@kwirthmagnify/kwirth-common-ai'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Manager del tipo `aitoolset` (plan: plans/ai-tools/PLAN.md, S1). Lo que se fija aqui son las reglas que
// protegen la coherencia entre el indice y el registro: ids reservados, id del paquete == id del toolset,
// y la reconciliacion de lo declarado en kwirth-dev.json.

// ConfigMaps en memoria: el manager solo necesita leer/escribir claves, no un cluster.
const fakeConfigMaps = (): IConfigMaps => {
    const store = new Map<string, any>()
    return {
        read: async (name: string, def?: any) => store.has(name) ? store.get(name) : def,
        write: async (name: string, data: any) => { if (data === null) store.delete(name); else store.set(name, data); return {} },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    } as unknown as IConfigMaps
}

/** Construye un tgz de aitoolset de verdad: package.json + back.js, como el que sale de un build. */
const makeToolsetTgz = async (id: string, exportedId = id): Promise<string> => {
    const dir = path.join(os.tmpdir(), `kwirth-test-aitoolset-${id}-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        id,
        name: `@test/kwirth-aitoolset-${id}`,
        version: '0.0.1',
        description: `test toolset ${id}`,
        extensionType: 'aitoolset'
    }, null, 2))
    // El modulo solo EXPORTA su definicion: no se auto-registra. Registrarlo es cosa del host.
    fs.writeFileSync(path.join(dir, 'back.js'), `
        module.exports.default = {
            id: '${exportedId}',
            version: '0.0.1',
            displayName: '${exportedId}',
            description: 'test',
            requires: ['k8s'],
            tools: [{ name: 'ping', description: 'ping', effect: 'read', sensitivity: 'public',
                      inputSchema: {}, execute: async () => 'pong' }]
        }
    `)
    const tgz = path.join(os.tmpdir(), `kwirth-test-aitoolset-${id}-${Date.now()}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['.'])
    fs.rmSync(dir, { recursive: true, force: true })
    return tgz
}

// ── reconciliacion de dev (funcion pura) ─────────────────────────────────────────────────────────────

test('solo se poda lo marcado dev y solo si ya no esta declarado', () => {
    const index: IAiToolsetMeta[] = [
        { id: 'a', name: 'a', version: '1', description: '', installedFrom: 'dev' },
        { id: 'b', name: 'b', version: '1', description: '', installedFrom: 'dev' },
        { id: 'c', name: 'c', version: '1', description: '', installedFrom: 'https://x/y.tgz' },
        { id: 'd', name: 'd', version: '1', description: '', installedFrom: 'bundled' }
    ]
    const stale = staleDevAiToolsets(index, new Set(['a'])).map(m => m.id)
    // 'b' sobra (dev y ya no declarado). 'c' y 'd' NO se tocan aunque no esten declarados: eso es
    // instalado de verdad, y podarlo seria desinstalarle al usuario algo que el puso.
    assert.deepEqual(stale, ['b'])
})

test('sin nada declarado se podan todos los dev, y solo los dev', () => {
    const index: IAiToolsetMeta[] = [
        { id: 'a', name: 'a', version: '1', description: '', installedFrom: 'dev' },
        { id: 'c', name: 'c', version: '1', description: '', installedFrom: 'https://x/y.tgz' }
    ]
    assert.deepEqual(staleDevAiToolsets(index, new Set()).map(m => m.id), ['a'])
})

// ── instalacion ──────────────────────────────────────────────────────────────────────────────────────

test('instalar registra el toolset y lo deja en el indice', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    const tgz = await makeToolsetTgz('test-install')
    const meta = await mgr.install(tgz, 'local')

    assert.equal(meta.id, 'test-install')
    assert.equal(getToolset('test-install')?.tools.length, 1)
    assert.deepEqual((await mgr.listInstalled()).map(m => m.id), ['test-install'])

    await mgr.uninstall('test-install')
    assert.equal(getToolset('test-install'), undefined)
    assert.deepEqual(await mgr.listInstalled(), [])
    fs.rmSync(tgz, { force: true })
})

test('un id reservado por un built-in se rechaza ANTES de tocar el indice', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    registerToolset({
        id: 'test-reserved', version: '1', displayName: 'r', description: '', requires: [ECapability.K8S],
        tools: [{ name: 't', description: '', effect: EToolEffect.READ, sensitivity: EToolSensitivity.PUBLIC, inputSchema: {} as any, execute: async () => null }]
    }, true)

    const tgz = await makeToolsetTgz('test-reserved')
    await assert.rejects(() => mgr.install(tgz, 'local'), /reserved/)
    // y el indice queda intacto: una entrada que nunca se podria registrar es peor que no instalar
    assert.deepEqual(await mgr.listInstalled(), [])
    fs.rmSync(tgz, { force: true })
})

test('un built-in no se puede desinstalar', async () => {
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    await assert.rejects(() => mgr.uninstall('test-reserved'), /built-in/)
    assert.ok(getToolset('test-reserved'))
})

test('si el id del paquete y el del toolset exportado no coinciden, no se registra', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    // package.json dice 'test-mismatch', el modulo exporta otro id distinto
    const tgz = await makeToolsetTgz('test-mismatch', 'otro-id')
    await mgr.install(tgz, 'local')

    // No se registra ninguno de los dos: ni el que dice el paquete ni el que dice el modulo. Registrar el
    // segundo dejaria el indice diciendo una cosa y el registro otra, y desinstalar no lo encontraria.
    assert.equal(getToolset('test-mismatch'), undefined)
    assert.equal(getToolset('otro-id'), undefined)

    await mgr.uninstall('test-mismatch')
    fs.rmSync(tgz, { force: true })
})

test('reinstalar encima reemplaza en vez de chocar con el registro', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    const tgz = await makeToolsetTgz('test-reinstall')
    await mgr.install(tgz, 'local')
    const before = listToolsets().filter(t => t.id === 'test-reinstall').length

    // Segunda instalacion del mismo id (version nueva, o el mismo dev tras un rebuild)
    await mgr.install(tgz, 'dev')
    const after = listToolsets().filter(t => t.id === 'test-reinstall').length

    assert.equal(before, 1)
    assert.equal(after, 1)   // reemplaza, no duplica ni revienta

    await mgr.uninstall('test-reinstall')
    fs.rmSync(tgz, { force: true })
})

// ── concesiones ──────────────────────────────────────────────────────────────────────────────────────

test('instalar por primera vez no concede el toolset a nadie', async () => {
    // Instalar deja DISPONIBLE, no concedido: instalar `k8s-ops` no puede dar escritura por accidente.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    const tgz = await makeToolsetTgz('test-nogrants')
    await mgr.install(tgz, 'local')

    assert.deepEqual(getToolsetGrants('test-nogrants'), [])

    await mgr.uninstall('test-nogrants')
    fs.rmSync(tgz, { force: true })
})

test('reinstalar NO revoca la concesion que el admin ya dio', async () => {
    // Reinstalar pasa por `unregisterToolset` para poder reemplazar, y ese se lleva la concesion con el
    // toolset. Sin reponerla, actualizar un toolset —o releer el dist de un dev en cada arranque— la
    // revocaba en silencio, y las dos mitades se contradecian: la tarjeta seguia diciendo a quien estaba
    // concedido (lo persistido, que instalar no toca) mientras el runtime respondia SIN CONCEDER.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()

    const tgz = await makeToolsetTgz('test-grants')
    await mgr.install(tgz, 'dev')
    await mgr.setGrants('test-grants', ['agora'])

    await mgr.install(tgz, 'dev')   // el rebuild de un dev, o una version nueva del marketplace

    assert.equal(isToolsetGrantedTo('test-grants', 'agora'), true, 'la concesion no sobrevivio a la reinstalacion')
    assert.deepEqual(getToolsetGrants('test-grants'), ['agora'])
    // y el registro en memoria y lo guardado dicen lo mismo, que es justo lo que se rompia
    assert.deepEqual((await mgr.listGrants())['test-grants'], ['agora'])

    await mgr.uninstall('test-grants')
    fs.rmSync(tgz, { force: true })
})

test('desinstalar SI se lleva la concesion, y tambien la guardada', async () => {
    // La otra mitad de la regla: reinstalar conserva, desinstalar revoca. Dejarla huerfana haria que
    // reinstalar resucitara permisos que nadie ha vuelto a conceder.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()

    const tgz = await makeToolsetTgz('test-grants-gone')
    await mgr.install(tgz, 'local')
    await mgr.setGrants('test-grants-gone', ['agora'])
    await mgr.uninstall('test-grants-gone')

    assert.equal(isToolsetGrantedTo('test-grants-gone', 'agora'), false)
    assert.equal((await mgr.listGrants())['test-grants-gone'], undefined)

    fs.rmSync(tgz, { force: true })
})

// ── instalacion desde carpeta (el camino de dev) ─────────────────────────────────────────────────────

test('instalar desde una CARPETA funciona y NO borra la carpeta', async () => {
    // En dev se apunta al dist de verdad del toolset, no a un tgz. El manager limpia sus temporales al
    // acabar, y si no distinguiera, se llevaria por delante el build del usuario en CADA arranque.
    const dir = path.join(os.tmpdir(), `kwirth-test-aitoolset-dir-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'test-fromdir', name: '@test/x', version: '0.0.1', description: 'd', extensionType: 'aitoolset' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `
        module.exports.default = { id: 'test-fromdir', version: '0.0.1', displayName: 'x', description: 'd',
            requires: [], tools: [{ name: 'ping', description: 'p', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async () => 'pong' }] }
    `)

    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    const meta = await mgr.install(dir, 'dev')

    assert.equal(meta.id, 'test-fromdir')
    assert.equal(getToolset('test-fromdir')?.tools.length, 1)
    assert.ok(fs.existsSync(path.join(dir, 'back.js')), 'la carpeta de origen sigue entera')

    await mgr.uninstall('test-fromdir')
    fs.rmSync(dir, { recursive: true, force: true })
})
