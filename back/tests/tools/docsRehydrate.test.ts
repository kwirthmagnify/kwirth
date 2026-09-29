import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DocsManager, IDocsMeta } from '../../src/tools/DocsManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    Bundled documentation whose files are no longer on disk.

    The index lives in ConfigMaps, which persists, and the extracted files live in the SYSTEM'S temporary
    directory, which does not: clean the temp folder and the two stop agreeing. Before this, the core
    kept saying "already installed", skipped it as routine, and the guide answered 404 for ever with
    nothing in the log explaining why — it happened to the core's own guide on 2026-09-29.
*/

const fakeConfigMaps = (): IConfigMaps => {
    const store = new Map<string, unknown>()
    return {
        read: async (name: string, def?: unknown) => store.has(name) ? store.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) store.delete(name); else store.set(name, data); return {} },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        storeLimit: () => undefined
    } as unknown as IConfigMaps
}

/** A real docs tgz: package.json plus a page, like the one build-docs-tgz produces. */
const makeDocsTgz = async (id: string, targetType: string, version: string): Promise<string> => {
    const dir = path.join(os.tmpdir(), `kwirth-test-docs-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        id, targetType, name: `@test/kwirth-docs-${id}`, version, description: 'test docs', extensionType: 'docs'
    }, null, 2))
    fs.writeFileSync(path.join(dir, 'index.md'), `# ${id} v${version}\n`)
    const tgz = path.join(os.tmpdir(), `kwirth-test-docs-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['.'])
    fs.rmSync(dir, { recursive: true, force: true })
    return tgz
}

/** A bundled directory holding just that tgz, which is what installBundled walks. */
const bundledDirWith = (tgz: string): string => {
    const dir = path.join(os.tmpdir(), `kwirth-test-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(tgz, path.join(dir, path.basename(tgz)))
    return dir
}

test('🔴 bundled docs whose files are gone get REINSTALLED, not skipped as already installed', async () => {
    const configMaps = fakeConfigMaps()
    const manager = new DocsManager(configMaps)
    await manager.init()

    const tgz = await makeDocsTgz('kwirth-test', 'core', '1.0.0')
    const bundle = bundledDirWith(tgz)
    await manager.installBundled(bundle)

    const dir = manager.getDocsDir('core', 'kwirth-test')
    assert.ok(dir, 'the first install did not leave the files')
    assert.ok(fs.existsSync(path.join(dir!, 'index.md')))

    // The temp folder is cleaned: the index still says installed, the files are gone. This is the state
    // that used to be unrecoverable.
    fs.rmSync(dir!, { recursive: true, force: true })
    assert.equal(manager.getDocsDir('core', 'kwirth-test'), undefined)
    assert.equal(((await configMaps.read('kwirth-docs-index', [])) as IDocsMeta[]).length, 1, 'the index still claims it')

    // Same version, same tgz: before the fix this was swallowed as 'already installed'.
    await manager.installBundled(bundle)
    const again = manager.getDocsDir('core', 'kwirth-test')
    assert.ok(again, 'the docs were NOT reinstalled: the guide would answer 404 for ever')
    assert.ok(fs.existsSync(path.join(again!, 'index.md')))
    // And it is not duplicated in the index.
    assert.equal(((await configMaps.read('kwirth-docs-index', [])) as IDocsMeta[]).length, 1)

    fs.rmSync(bundle, { recursive: true, force: true })
    fs.rmSync(tgz, { force: true })
})

/*
    The path that really broke, and the one the first fix missed: STARTUP.

    loadAll() is what runs on every boot. It used to hand a missing bundled package to rehydrate(), which
    skips it saying installBundled() handles it — and installBundled() only ran when
    BUNDLED_EXTENSIONS_PATH was set, which in development it never is. The guide stayed 404 for ever with
    nothing in the log, and a fix living only in installBundled() would have gone on doing nothing.
*/
test('🔴 at startup, bundled docs with no files are restored from the bundle even without BUNDLED_EXTENSIONS_PATH', async () => {
    const configMaps = fakeConfigMaps()
    const before = process.env.BUNDLED_EXTENSIONS_PATH
    delete process.env.BUNDLED_EXTENSIONS_PATH

    // A bundle where the back end looks for it when the variable is absent: ./bundle/docs
    const cwd = process.cwd()
    const bundleDir = path.join(cwd, 'bundle', 'docs')
    const preexisting = fs.existsSync(bundleDir)
    fs.mkdirSync(bundleDir, { recursive: true })
    const tgz = await makeDocsTgz('kwirth-boot', 'core', '1.0.0')
    const placed = path.join(bundleDir, path.basename(tgz))
    fs.copyFileSync(tgz, placed)

    try {
        const first = new DocsManager(configMaps)
        await first.init()
        await first.installBundled(bundleDir)
        const dir = first.getDocsDir('core', 'kwirth-boot')!
        assert.ok(fs.existsSync(dir))

        // The temp folder is cleaned; the index survives in ConfigMaps. This is the state after a reboot.
        fs.rmSync(dir, { recursive: true, force: true })

        const afterReboot = new DocsManager(configMaps)
        await afterReboot.init()
        await afterReboot.loadAll()
        assert.ok(afterReboot.getDocsDir('core', 'kwirth-boot'), 'startup did not restore the bundled docs: their pages answer 404 for ever')
    }
    finally {
        if (before === undefined) delete process.env.BUNDLED_EXTENSIONS_PATH
        else process.env.BUNDLED_EXTENSIONS_PATH = before
        fs.rmSync(placed, { force: true })
        // The repo's own bundle folder is left exactly as it was found.
        if (!preexisting) fs.rmSync(path.join(cwd, 'bundle'), { recursive: true, force: true })
        fs.rmSync(tgz, { force: true })
        const restored = new DocsManager(configMaps)
        await restored.init()
        const d = restored.getDocsDir('core', 'kwirth-boot')
        if (d) fs.rmSync(d, { recursive: true, force: true })
    }
})

test('with its files in place and the same version, bundled docs are left alone', async () => {
    const manager = new DocsManager(fakeConfigMaps())
    await manager.init()

    const tgz = await makeDocsTgz('kwirth-untouched', 'core', '1.0.0')
    const bundle = bundledDirWith(tgz)
    await manager.installBundled(bundle)
    const dir = manager.getDocsDir('core', 'kwirth-untouched')!
    // A file nobody in the package put there: if it survives, the directory was not rebuilt.
    fs.writeFileSync(path.join(dir, 'marker.txt'), 'untouched')

    await manager.installBundled(bundle)
    assert.ok(fs.existsSync(path.join(dir, 'marker.txt')), 'it reinstalled without needing to')

    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(bundle, { recursive: true, force: true })
    fs.rmSync(tgz, { force: true })
})
