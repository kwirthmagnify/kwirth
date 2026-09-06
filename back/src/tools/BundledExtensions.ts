import fs from 'fs'
import os from 'os'
import path from 'path'
import * as tar from 'tar'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

// El directorio de extensiones bundled es COMPARTIDO: contiene tgz de cualquier tipo (plugins, logins,
// docs, idps...). Cada manager tiene que quedarse solo con los suyos, y el unico campo que dice de que
// tipo es un tgz es extensionType, que emiten todos los build.mjs.
//
// Sin este filtro pasaban dos cosas: DocsManager instalaba como documentacion cualquier tgz que llevara
// targetType (un login bundled lo lleva, asi que acababa duplicado como doc), y PluginManager/IdpManager
// intentaban instalar TODOS los tgz del directorio, apoyandose en que el fallo posterior los descartara.

/** Lee el extensionType declarado dentro de un tgz. undefined si no lo declara o no se puede leer. */
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

/** Los tgz de un directorio bundled que son del tipo pedido, con su ruta absoluta. */
export const listBundledOfType = async (dir: string, extensionType: EExtensionType): Promise<string[]> => {
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tgz')).map(f => path.join(dir, f))
    const typed = await Promise.all(files.map(async f => ({ file: f, type: await peekExtensionType(f) })))
    return typed.filter(t => t.type === extensionType).map(t => t.file)
}
