import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDevTgz } from '../../src/tools/Utils'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    An entry in kwirth-dev.json may name the tgz or the FOLDER that holds it.

    It used to have to name the file, and the file had no version in its name ('excubitor.tgz'). Now that
    every tarball carries scope and version, naming the file would mean editing kwirth-dev.json on every
    bump, and forgetting it does NOT fail: the dev silently serves a guide — or a login — from an older
    version. Both DocsManager and LoginManager go through this.
*/

const tempDir = (): string => {
    const dir = path.join(os.tmpdir(), `kwirth-test-devtgz-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

const touch = (dir: string, file: string, mtime?: Date): string => {
    const full = path.join(dir, file)
    fs.writeFileSync(full, 'x')
    if (mtime) fs.utimesSync(full, mtime, mtime)
    return full
}

const inTemp = (body: (dir: string) => void): void => {
    const dir = tempDir()
    try { body(dir) }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test('a path naming the tgz itself is used as-is, with nothing to say', () => {
    inTemp(dir => {
        const tgz = touch(dir, 'iriaoperae-docs-excubitor-0.2.63.tgz')
        assert.deepEqual(resolveDevTgz(tgz, "Docs 'excubitor'"), { tgz })
    })
})

test('a folder holding one tarball resolves to it, whatever its version is', () => {
    inTemp(dir => {
        const tgz = touch(dir, 'iriaoperae-docs-excubitor-0.2.64.tgz')
        assert.deepEqual(resolveDevTgz(dir, "Docs 'excubitor'"), { tgz })
    })
})

test('a folder with no tarball yields no path, and says why', () => {
    inTemp(dir => {
        touch(dir, 'index.md')
        const { tgz, warning } = resolveDevTgz(dir, "Docs 'excubitor'")
        assert.equal(tgz, undefined)
        assert.match(warning ?? '', /no \.tgz inside/)
    })
})

test('a path that does not exist yields no path, and says why', () => {
    const { tgz, warning } = resolveDevTgz(path.join(os.tmpdir(), 'kwirth-test-does-not-exist-at-all'), "Login 'montag'")
    assert.equal(tgz, undefined)
    assert.match(warning ?? '', /not found/)
})

test('several tarballs: the newest wins and it is NOT silent about it', () => {
    inTemp(dir => {
        touch(dir, 'iriaoperae-docs-excubitor-0.2.63.tgz', new Date(Date.now() - 60_000))
        const fresh = touch(dir, 'iriaoperae-docs-excubitor-0.2.64.tgz', new Date())
        const { tgz, warning } = resolveDevTgz(dir, "Docs 'excubitor'")
        assert.equal(tgz, fresh)
        assert.match(warning ?? '', /2 tarballs/)
    })
})

test('the newest wins by mtime, not by name order', () => {
    inTemp(dir => {
        // Named last alphabetically but built first: sorting by name would pick this one.
        touch(dir, 'iriaoperae-docs-excubitor-0.9.0.tgz', new Date(Date.now() - 60_000))
        const fresh = touch(dir, 'iriaoperae-docs-excubitor-0.10.0.tgz', new Date())
        assert.equal(resolveDevTgz(dir, "Docs 'excubitor'").tgz, fresh)
    })
})

test('a login folder works the same: it is the same resolver for both', () => {
    inTemp(dir => {
        const tgz = touch(dir, 'jfvilas-login-asteroids-0.1.2.tgz')
        assert.deepEqual(resolveDevTgz(dir, "Login 'asteroids'"), { tgz })
    })
})
