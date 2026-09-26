import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType, peekExtensionType } from '../../src/tools/BundledExtensions'

// The bundled extensions directory is a SINGLE one for every type, so each manager has to keep its own by
// looking at the extensionType each tgz declares. It used not to filter: DocsManager installed as
// documentation any tgz with a targetType (a login carried one) and PluginManager/IdpManager tried to
// install every one in the directory, expecting the later failure to discard them.

const makeTgz = async (dir: string, name: string, pkg: Record<string, unknown>): Promise<string> => {
    const stage = path.join(dir, `.stage-${name}`, 'package')
    fs.mkdirSync(stage, { recursive: true })
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg))
    const tgz = path.join(dir, `${name}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: path.dirname(stage) }, ['package'])
    fs.rmSync(path.dirname(stage), { recursive: true, force: true })
    return tgz
}

const withBundledDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-bundled-test-'))
    try {
        await fn(dir)
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

test('peekExtensionType lee el tipo declarado dentro del tgz', async () => {
    await withBundledDir(async dir => {
        const tgz = await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login' })
        assert.equal(await peekExtensionType(tgz), 'login')
    })
})

test('peekExtensionType devuelve undefined si el tgz no declara tipo', async () => {
    await withBundledDir(async dir => {
        const tgz = await makeTgz(dir, 'legacy', { id: 'legacy' })
        assert.equal(await peekExtensionType(tgz), undefined)
    })
})

test('peekExtensionType no revienta con un fichero que no es un tgz', async () => {
    await withBundledDir(async dir => {
        const fake = path.join(dir, 'roto.tgz')
        fs.writeFileSync(fake, 'esto no es un tar')
        assert.equal(await peekExtensionType(fake), undefined)
    })
})

test('cada manager ve SOLO los tgz de su tipo en el directorio compartido', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login' })
        await makeTgz(dir, 'excubitor-docs', { id: 'excubitor', extensionType: 'docs', targetType: 'plugin' })
        await makeTgz(dir, 'entra', { id: 'entra', extensionType: 'idp' })

        const names = async (t: EExtensionType) => (await listBundledOfType(dir, t)).map(f => path.basename(f)).sort()

        assert.deepEqual(await names(EExtensionType.PLUGIN), ['log.tgz'])
        assert.deepEqual(await names(EExtensionType.LOGIN), ['magnify.tgz'])
        assert.deepEqual(await names(EExtensionType.DOCS), ['excubitor-docs.tgz'])
        assert.deepEqual(await names(EExtensionType.IDP), ['entra.tgz'])
    })
})

test('un login bundled NO se cuela como documentacion aunque lleve targetType', async () => {
    await withBundledDir(async dir => {
        // The login declares a targetType out of historical error; the only valid discriminator is extensionType.
        await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login', targetType: 'plugin' })
        assert.deepEqual(await listBundledOfType(dir, EExtensionType.DOCS), [])
    })
})

test('los tgz sin extensionType no se asignan a ningun tipo', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'legacy', { id: 'legacy' })
        for (const t of [EExtensionType.PLUGIN, EExtensionType.LOGIN, EExtensionType.DOCS, EExtensionType.IDP]) {
            assert.deepEqual(await listBundledOfType(dir, t), [], `tipo ${t}`)
        }
    })
})

test('lo que no es .tgz se ignora', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        fs.writeFileSync(path.join(dir, 'README.md'), '# nada')
        fs.writeFileSync(path.join(dir, 'log.tgz.bak'), 'nada')
        const found = await listBundledOfType(dir, EExtensionType.PLUGIN)
        assert.equal(found.length, 1)
        assert.equal(path.basename(found[0]), 'log.tgz')
    })
})

test('un directorio bundled inexistente devuelve lista vacia, no excepcion', async () => {
    assert.deepEqual(await listBundledOfType(path.join(os.tmpdir(), 'kwirth-no-existe-jamas'), EExtensionType.PLUGIN), [])
})

test('devuelve rutas absolutas listas para install()', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        const [found] = await listBundledOfType(dir, EExtensionType.PLUGIN)
        assert.equal(path.isAbsolute(found), true)
        assert.equal(fs.existsSync(found), true)
    })
})
