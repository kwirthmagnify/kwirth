import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import tar from 'tar'
import { randomBytes } from 'node:crypto'
import { ThemeManager } from '../../src/tools/ThemeManager'
import { HomepageManager } from '../../src/tools/HomepageManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { cachedExtensionFile } from '../../src/tools/PackageRegistries'

/*
    Instalacion de temas y homepages, que son gemelos y no tenian ningun test.

    Lo que importa aqui, y que se aprendio a base de sustos:

      · un tgz puede traer las entradas en la RAIZ (los que armamos a mano) o dentro de 'package/' (todo
        lo que sale de `npm publish`), y las dos formas tienen que instalar igual;
      · un front que no cabe en el ConfigMap (~1 MiB por objeto en etcd) NO se guarda ahi: se marca
        `frontStored: false` y se recupera del origen, con cache en /tmp;
      · esa cache HAY que invalidarla al instalar y al desinstalar. No lleva la version en el nombre, asi
        que sin borrarla una actualizacion seguiria sirviendo el front VIEJO mientras el pod siga vivo.
*/

interface IStoreView { configMaps: Map<string, any> }

const makeConfigMaps = () => {
    const store: IStoreView = { configMaps: new Map() }
    const configMaps: IConfigMaps = {
        write: async (name: string, data: any) => { store.configMaps.set(name, data) },
        read: async (name: string, defaultValue?: any) => store.configMaps.has(name) ? store.configMaps.get(name) : defaultValue,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    return { configMaps, store }
}

interface IBundleOptions {
    id?: string
    version?: string
    // true = entradas dentro de 'package/', como deja `npm publish`
    npmLayout?: boolean
    front?: string
    // no incluir front.js, para el caso del bundle invalido
    noFront?: boolean
}

// Un tgz de verdad en un directorio temporal: install() acepta rutas locales, asi que no hace falta red
const makeBundle = (dir: string, options: IBundleOptions = {}): string => {
    const id = options.id ?? 'santander'
    const root = options.npmLayout ? path.join(dir, 'package') : dir
    mkdirSync(root, { recursive: true })
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        name: `@kwirthmagnify/kwirth-theme-${id}`,
        id,
        displayName: `${id} theme`,
        version: options.version ?? '1.0.0',
        description: 'a theme',
    }))
    if (!options.noFront) writeFileSync(path.join(root, 'front.js'), options.front ?? 'window.__theme = {}')
    const tgz = path.join(dir, `${id}.tgz`)
    const entries = options.noFront ? ['package.json'] : ['package.json', 'front.js']
    tar.c({ file: tgz, cwd: root, sync: true, gzip: true }, entries)
    return tgz
}

const tempDir = (): string => mkdtempSync(path.join(os.tmpdir(), 'kwirth-theme-test-'))

/*
    Un front que NO cabe en el ConfigMap. Tiene que ser incompresible de verdad: con texto periodico
    gzip lo deja en nada y el front acaba cabiendo, que es justo lo contrario de lo que se quiere probar.
    El tope efectivo son 800 KB de base64 DESPUES de gzip.
*/
const frontQueNoCabe = (): string => randomBytes(800_000).toString('base64')

test('un tema se instala desde un tgz con las entradas en la raiz', async () => {
    const dir = tempDir()
    const { configMaps, store } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    const meta = await tm.install(makeBundle(dir))

    assert.equal(meta.id, 'santander')
    assert.equal(meta.version, '1.0.0')
    assert.equal(meta.frontStored, true, 'un front pequeño cabe en el ConfigMap')
    assert.deepEqual(tm.getInstalledIds(), ['santander'])
    assert.equal(await tm.getFrontJs('santander'), 'window.__theme = {}')
    // y queda en el indice, que es lo que lee el arranque siguiente
    const index = store.configMaps.get('kwirth-themes-index')
    assert.deepEqual(index.map((t: any) => t.id), ['santander'])

    rmSync(dir, { recursive: true, force: true })
})

test('y tambien desde un tgz de npm, con todo dentro de package/', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    const meta = await tm.install(makeBundle(dir, { npmLayout: true, front: 'window.__theme = { npm: true }' }))

    assert.equal(meta.id, 'santander')
    assert.equal(await tm.getFrontJs('santander'), 'window.__theme = { npm: true }')

    rmSync(dir, { recursive: true, force: true })
})

test('un tgz sin front.js no se instala a medias: falla y lo dice', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    await assert.rejects(() => tm.install(makeBundle(dir, { noFront: true })), /Invalid theme bundle/)
    assert.deepEqual(tm.getInstalledIds(), [], 'y no deja el id registrado')

    rmSync(dir, { recursive: true, force: true })
})

test('instalar dos veces el mismo id se rechaza', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    await tm.install(makeBundle(dir))
    await assert.rejects(() => tm.install(makeBundle(dir)), /already installed/)

    rmSync(dir, { recursive: true, force: true })
})

test('un front que no cabe en el ConfigMap no se guarda ahi, y se anota para recuperarlo del origen', async () => {
    const dir = tempDir()
    const { configMaps, store } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    const enorme = frontQueNoCabe()
    const meta = await tm.install(makeBundle(dir, { front: enorme }))

    assert.equal(meta.frontStored, false, 'se pasa del limite del ConfigMap')
    assert.equal(store.configMaps.get('kwirth-theme-santander').code, undefined, 'y el codigo no se guarda')

    rmSync(dir, { recursive: true, force: true })
})

test('cuando el front no esta guardado, se sirve lo cacheado en /tmp sin tocar la red', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    const enorme = frontQueNoCabe()
    await tm.install(makeBundle(dir, { front: enorme }))

    /*
        La cache se rellena aqui a mano porque el camino real la llena tras DESCARGAR del origen, y este
        test no toca la red a proposito: lo que se comprueba es que, estando la cache, no se descarga —que
        es justo lo que evita bajarse el tarball entero en cada arranque.
    */
    const cache = cachedExtensionFile('theme', 'santander', 'front.js')
    writeFileSync(cache, 'window.__theme = { fromCache: true }')

    assert.equal(await tm.getFrontJs('santander'), 'window.__theme = { fromCache: true }')

    rmSync(cache, { force: true })
    rmSync(dir, { recursive: true, force: true })
})

test('desinstalar borra la cache de /tmp: reinstalar no puede servir el front anterior', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()
    await tm.install(makeBundle(dir))

    const cache = cachedExtensionFile('theme', 'santander', 'front.js')
    writeFileSync(cache, 'el viejo')

    await tm.uninstall('santander')

    assert.equal(existsSync(cache), false)
    assert.deepEqual(tm.getInstalledIds(), [])

    rmSync(dir, { recursive: true, force: true })
})

test('instalar una version nueva tambien borra la cache de la anterior', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const tm = new ThemeManager(configMaps)
    await tm.init()

    const cache = cachedExtensionFile('theme', 'santander', 'front.js')
    writeFileSync(cache, 'el de la version vieja')

    await tm.install(makeBundle(dir, { version: '2.0.0' }))

    assert.equal(existsSync(cache), false, 'si sobrevive, una actualizacion sigue sirviendo el front viejo')

    rmSync(dir, { recursive: true, force: true })
})

test('una homepage se instala igual que un tema, en los dos formatos de tgz', async () => {
    for (const npmLayout of [false, true]) {
        const dir = tempDir()
        const { configMaps } = makeConfigMaps()
        const hm = new HomepageManager(configMaps)
        await hm.init()

        const meta = await hm.install(makeBundle(dir, { id: 'welcome', npmLayout, front: 'window.__home = {}' }))

        assert.equal(meta.id, 'welcome')
        assert.equal(await hm.getFrontJs('welcome'), 'window.__home = {}')
        assert.deepEqual(hm.getInstalledIds(), ['welcome'])

        rmSync(dir, { recursive: true, force: true })
    }
})

test('y su cache se invalida igual, al instalar y al desinstalar', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const hm = new HomepageManager(configMaps)
    await hm.init()

    const cache = cachedExtensionFile('homepage', 'welcome', 'front.js')
    writeFileSync(cache, 'el viejo')
    await hm.install(makeBundle(dir, { id: 'welcome' }))
    assert.equal(existsSync(cache), false, 'al instalar')

    writeFileSync(cache, 'otro viejo')
    await hm.uninstall('welcome')
    assert.equal(existsSync(cache), false, 'y al desinstalar')

    rmSync(dir, { recursive: true, force: true })
})

test('el indice sobrevive a un reinicio: init() lo relee del ConfigMap', async () => {
    const dir = tempDir()
    const { configMaps } = makeConfigMaps()
    const primero = new ThemeManager(configMaps)
    await primero.init()
    await primero.install(makeBundle(dir))

    // otro manager sobre el mismo almacen es lo que pasa al reiniciar el proceso
    const segundo = new ThemeManager(configMaps)
    await segundo.init()

    assert.deepEqual(segundo.getInstalledIds(), ['santander'])
    assert.equal(await segundo.getFrontJs('santander'), 'window.__theme = {}')

    rmSync(dir, { recursive: true, force: true })
})
