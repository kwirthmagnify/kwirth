import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    What the seven scaffolders actually GENERATE, run for real.

    This is the test that was missing, and the one that would have caught every mistake this area has
    had. All of them were in the mould, and the mould had no test:

      · create-kwirth-theme / -homepage / -login wrote OUR scope into whatever anybody generated, so a
        third party walked away with '@kwirthmagnify' inside their own artifact.
      · create-kwirth-plugin asked for a publisher, wrote it into package.json — and then generated a
        build.mjs that hard-coded '@kwirthmagnify/kwirth-plugin-<id>' into dist/package.json, which is
        the file the marketplace and the installer actually go by.
      · create-kwirth-login generated '@scope/login-<id>', a name no login in the repo uses.

    So the checks are: the npm name is the one the helper builds, the publisher is the one asked for,
    the JSON parses, and 🔴 OUR scope appears nowhere in what a third party generates — except as a
    dependency on Kwirth's own libraries, which is a different thing.

    The scaffolders are run in a temp folder: they create '<type>s/<id>/' relative to the cwd.
*/

const REPO_ROOT = path.resolve(process.cwd(), '..')
const toolOf = (name: string): string => path.join(REPO_ROOT, 'tools', `create-kwirth-${name}.mjs`)

/** Every type whose scaffolder writes a package.json, and the folder it lands in. */
const TYPES: { tool: string; type: string; dir: string }[] = [
    { tool: 'theme', type: 'theme', dir: 'themes' },
    { tool: 'homepage', type: 'homepage', dir: 'homepages' },
    { tool: 'provider', type: 'provider', dir: 'providers' },
    { tool: 'dce', type: 'dce', dir: 'dces' },
    { tool: 'aitoolset', type: 'aitoolset', dir: 'aitoolsets' },
    { tool: 'plugin', type: 'plugin', dir: 'plugins' },
    { tool: 'login', type: 'login', dir: 'logins' },
]

const scaffold = (tool: string, cwd: string, extra: string[] = []): void => {
    execFileSync(process.execPath, [toolOf(tool), '--id', 'probe', '--publisher', '@acme', ...extra], {
        cwd, stdio: 'pipe',
    })
}

const withTemp = (body: (dir: string) => void): void => {
    const dir = path.join(os.tmpdir(), `kwirth-test-scaffold-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    try { body(dir) }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

for (const { tool, type, dir } of TYPES) {
    test(`create-kwirth-${tool} genera @acme/kwirth-${type}-probe, y el JSON es valido`, () => {
        assert.ok(fs.existsSync(toolOf(tool)), `no existe el scaffolder ${toolOf(tool)}`)
        withTemp(tmp => {
            scaffold(tool, tmp)
            const pkgPath = path.join(tmp, dir, 'probe', 'package.json')
            assert.ok(fs.existsSync(pkgPath), `no se genero ${dir}/probe/package.json`)
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
            assert.equal(pkg.name, `@acme/kwirth-${type}-probe`)
            assert.equal(pkg.publisher, '@acme')
            assert.equal(pkg.id, 'probe')
        })
    })
}

test('🔴 nuestro scope NO aparece en lo que genera un tercero, salvo como dependencia', () => {
    withTemp(tmp => {
        scaffold('plugin', tmp)
        const dir = path.join(tmp, 'plugins', 'probe')
        for (const file of ['build.mjs', 'watch.mjs', 'package.json']) {
            const full = path.join(dir, file)
            if (!fs.existsSync(full)) continue
            for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
                // '@kwirthmagnify/kwirth-common*' is a DEPENDENCY on Kwirth's libraries and stays.
                if (line.includes('@kwirthmagnify') && !line.includes('kwirth-common')) {
                    assert.fail(`${file} regala nuestro scope: ${line.trim()}`)
                }
            }
        }
    })
})

test('el build generado compone el nombre desde publisher, no desde un literal', () => {
    withTemp(tmp => {
        scaffold('plugin', tmp)
        const build = fs.readFileSync(path.join(tmp, 'plugins', 'probe', 'build.mjs'), 'utf-8')
        // dist/package.json is what the marketplace and the installer read: if the name were a literal,
        // changing `publisher` later would leave the two disagreeing.
        assert.match(build, /name: `\$\{meta\.publisher\}\/kwirth-plugin-\$\{meta\.id\}`/)
    })
})

test('un DCE de otra casa se nombra entero, y el filtro de esbuild lo deja pasar', () => {
    withTemp(tmp => {
        // The case that was impossible: a paid plugin consuming a public DCE.
        scaffold('plugin', tmp, ['--dce', '@kwirthmagnify/xyflow:0.1.0'])
        const dir = path.join(tmp, 'plugins', 'probe')
        const build = fs.readFileSync(path.join(dir, 'build.mjs'), 'utf-8')
        assert.match(build, /'@kwirthmagnify\/kwirth-dce-xyflow': 'xyflow'/)
        /*  A DCE filter pinned to one house skipped these imports, and the DCE ended up BUNDLED instead
            of resolved — two instances of a type that guarantees one, with nothing failing.

            Only the DCE filter is looked at: the one right above it IS pinned to @kwirthmagnify on
            purpose, because it resolves kwirth-common, a dependency on our libraries. */
        assert.match(build, /onResolve\(\{ filter: \/\^@\[\^\/\]\+\\\/\(kwirth-\)\?dce-\//)
        assert.ok(!/onResolve\(\{ filter: \/\^@kwirthmagnify[^\n]*dce-/.test(build), 'el filtro de DCE sigue clavado a una sola casa')
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
        assert.equal(pkg.dependencies['@kwirthmagnify/kwirth-dce-xyflow'], '^0.1.0')
        assert.deepEqual(pkg.requiresExtension, [{ extensionType: 'dce', id: 'xyflow', minVersion: '0.1.0' }])
    })
})

for (const { tool } of TYPES) {
    test(`create-kwirth-${tool} FALLA si no se le da --publisher, en vez de inventarse uno`, () => {
        withTemp(tmp => {
            /*  Encontrado en el QA del 2026-10-22, y no en teoría: PowerShell se come un argumento que
                empiece por '@' (lo trata como splatting de una variable que no existe), así que
                `--publisher @jfvilas` llega como un '--publisher' suelto. El scaffolder cogía entonces el
                default '@my-scope' y generaba el artefacto entero con un scope inventado, sin una
                palabra — y el publisher decide el nombre npm, el del tarball y el registro al que va. */
            assert.throws(
                () => execFileSync(process.execPath, [toolOf(tool), '--id', 'probe'], { cwd: tmp, stdio: 'pipe' }),
                (err: unknown) => {
                    const stderr = String((err as { stderr?: Buffer }).stderr ?? '')
                    assert.match(stderr, /--publisher is required/)
                    assert.match(stderr, /PowerShell/)
                    return true
                },
            )
            assert.ok(!fs.existsSync(path.join(tmp, 'plugins')) && !fs.existsSync(path.join(tmp, 'logins')),
                'no debe dejar nada generado cuando falla')
        })
    })
}

test('el login empaqueta <scope>-kwirth-login-<id>-<version>.tgz, de verdad', () => {
    withTemp(tmp => {
        scaffold('login', tmp)
        const dir = path.join(tmp, 'logins', 'probe')
        execFileSync(process.execPath, ['build.mjs'], { cwd: dir, stdio: 'pipe' })
        const tgzs = fs.readdirSync(path.join(dir, 'dist')).filter(f => f.endsWith('.tgz'))
        assert.deepEqual(tgzs, ['acme-kwirth-login-probe-0.1.0.tgz'])
    })
})
