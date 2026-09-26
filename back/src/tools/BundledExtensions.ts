import fs from 'fs'
import os from 'os'
import path from 'path'
import * as tar from 'tar'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

// The bundled extensions directory is SHARED: it holds tgz files of every type (plugins, logins, docs,
// idps...). Every manager has to keep only its own, and the only field saying what type a tgz is is
// extensionType, which every build.mjs emits.
//
// Without this filter two things happened: DocsManager installed as documentation any tgz carrying a
// targetType (a bundled login carries one, so it ended up duplicated as docs), and PluginManager/IdpManager
// attempted ALL of the directory's tgz files, leaning on the later failure to discard them.

/** Reads the extensionType declared inside a tgz. undefined when it does not declare it or it cannot be read. */
export const peekExtensionType = async (tgzPath: string): Promise<string|undefined> => {
    const peekDir = path.join(os.tmpdir(), `kwirth-type-peek-${path.basename(tgzPath, '.tgz')}-${Date.now()}`)
    try {
        fs.mkdirSync(peekDir, { recursive: true })
        await tar.x({ file: tgzPath, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
        const pkgPath = [path.join(peekDir, 'package.json'), path.join(peekDir, 'package', 'package.json')].find(p => fs.existsSync(p))
        if (!pkgPath) return undefined
        return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).extensionType
    }
    catch {
        return undefined
    }
    finally {
        fs.rmSync(peekDir, { recursive: true, force: true })
    }
}

/** The tgz files of a bundled directory that are of the requested type, with their absolute path. */
export const listBundledOfType = async (dir: string, extensionType: EExtensionType): Promise<string[]> => {
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tgz')).map(f => path.join(dir, f))
    const typed = await Promise.all(files.map(async f => ({ file: f, type: await peekExtensionType(f) })))
    return typed.filter(t => t.type === extensionType).map(t => t.file)
}
