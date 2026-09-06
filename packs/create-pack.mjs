#!/usr/bin/env node
/**
 * Crea un pack tgz a partir de extension tgzs.
 *
 * Uso:
 *   node packs/create-pack.mjs <pack-id> [opciones] [tgz1 tgz2 ...]
 *
 * Opciones:
 *   --include tipo:nombre   Buildea + empaqueta la extensión y la incluye en el pack.
 *                           Se puede repetir. Tipos: plugin, provider, sender, theme,
 *                           homepage, idp, login.
 *   --name        Nombre de display del pack          (default: pack-id)
 *   --version     Versión del pack                    (default: 1.0.0)
 *   --description Descripción                         (default: "")
 *   --website     URL de la web del pack              (default: "")
 *   --output      Ruta del tgz de salida              (default: <id>-<version>.pack.tgz)
 *
 * Ejemplos:
 *   # Desde tgzs ya construidos
 *   node packs/create-pack.mjs my-pack ./themes/avicii/dist/avicii.tgz \
 *     --name "My Pack" --version "1.0.0"
 *
 *   # Buildea y empaqueta automáticamente
 *   node packs/create-pack.mjs my-pack \
 *     --include theme:avicii --include homepage:matrix \
 *     --name "My Pack" --version "1.0.0"
 *
 *   # Mixto: algunos --include y algún tgz ya construido
 *   node packs/create-pack.mjs my-pack ./plugins/foo/dist/foo.tgz \
 *     --include theme:avicii
 */

import { createRequire } from 'node:module'
import { mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, basename, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const tar = require('../back/node_modules/tar')

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT  = resolve(SCRIPT_DIR, '..')

const TYPE_DIRS = {
    plugin:   'plugins',
    provider: 'providers',
    sender:   'senders',
    theme:    'themes',
    homepage: 'homepages',
    idp:      'idps',
    login:    'logins',
}

// --- parse args ---
const rawArgs = process.argv.slice(2)
if (rawArgs.length < 1) {
    console.error('Uso: node packs/create-pack.mjs <pack-id> [--include tipo:nombre ...] [tgz ...] [--name "..."] [--version "1.0.0"] [--description "..."] [--website "..."] [--output out.pack.tgz]')
    process.exit(1)
}

const opts = { name: undefined, version: '1.0.0', description: '', website: '', output: undefined }
const includes   = []   // { type, name } from --include
const inputTgzs  = []   // tgz paths provided directly
let packId

for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]
    if (a === '--include') {
        const val = rawArgs[++i]
        const colon = val.indexOf(':')
        if (colon < 1) { console.error(`--include debe ser 'tipo:nombre', recibido: '${val}'`); process.exit(1) }
        includes.push({ type: val.slice(0, colon), name: val.slice(colon + 1) })
        continue
    }
    if (a === '--name')        { opts.name        = rawArgs[++i]; continue }
    if (a === '--version')     { opts.version      = rawArgs[++i]; continue }
    if (a === '--description') { opts.description  = rawArgs[++i]; continue }
    if (a === '--website')     { opts.website      = rawArgs[++i]; continue }
    if (a === '--output')      { opts.output       = rawArgs[++i]; continue }
    if (!packId) { packId = a; continue }
    inputTgzs.push(a)
}

if (!packId) { console.error('Error: falta pack-id'); process.exit(1) }
if (!includes.length && !inputTgzs.length) { console.error('Error: se necesita al menos un --include o un tgz'); process.exit(1) }

opts.name   = opts.name   ?? packId
opts.output = opts.output ?? `${packId}-${opts.version}.pack.tgz`

// --- helpers ---
async function readPkgFromTgz(tgzPath) {
    const peekDir = join(tmpdir(), `pack-peek-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(peekDir, { recursive: true })
    try {
        await tar.x({ file: tgzPath, cwd: peekDir, filter: p => p.endsWith('package.json') })
        const candidates = [join(peekDir, 'package.json'), join(peekDir, 'package', 'package.json')]
        const found = candidates.find(p => existsSync(p))
        if (!found) throw new Error(`No se encontró package.json en ${tgzPath}`)
        return JSON.parse(readFileSync(found, 'utf-8'))
    }
    finally {
        rmSync(peekDir, { recursive: true, force: true })
    }
}

async function buildAndPack(type, name) {
    const typeDir = TYPE_DIRS[type]
    if (!typeDir) throw new Error(`Tipo desconocido: '${type}'. Válidos: ${Object.keys(TYPE_DIRS).join(', ')}`)

    const extDir  = join(REPO_ROOT, typeDir, name)
    const distDir = join(extDir, 'dist')
    if (!existsSync(extDir)) throw new Error(`Directorio no encontrado: ${extDir}`)

    process.stdout.write(`  build... `)
    execSync('node build.mjs', { cwd: extDir, stdio: 'pipe' })
    console.log(`ok`)

    if (!existsSync(distDir)) throw new Error(`dist/ no existe tras el build: ${distDir}`)

    process.stdout.write(`  npm pack... `)
    execSync('npm pack', { cwd: distDir, stdio: 'pipe' })

    const tgzFiles = readdirSync(distDir)
        .filter(f => f.endsWith('.tgz'))
        .map(f => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)

    if (!tgzFiles.length) throw new Error(`npm pack no generó ningún .tgz en: ${distDir}`)
    const tgzPath = join(distDir, tgzFiles[0].f)
    console.log(`ok  (${tgzFiles[0].f})`)
    return tgzPath
}

// --- main ---
console.log(`\nCreando pack '${packId}' v${opts.version}...`)

// Paso 1: procesar --include (build + pack)
const builtTgzs = []
if (includes.length) {
    console.log('\nBuilding extensions:')
    for (const inc of includes) {
        process.stdout.write(`  ${inc.type}:${inc.name}\n`)
        try {
            const tgzPath = await buildAndPack(inc.type, inc.name)
            builtTgzs.push(tgzPath)
            inputTgzs.push(tgzPath)
        }
        catch (err) {
            console.error(`  ✗ ${err.message}`)
            process.exit(1)
        }
    }
}

// Paso 2: construir el pack
const workDir = join(tmpdir(), `pack-build-${Date.now()}`)
const pkgDir  = join(workDir, 'package')
mkdirSync(pkgDir, { recursive: true })

const extensions = []
console.log('\nProcesando extensiones:')
for (const rawPath of inputTgzs) {
    const tgzPath = resolve(rawPath)
    if (!existsSync(tgzPath)) { console.error(`  ✗ No existe: ${tgzPath}`); process.exit(1) }

    process.stdout.write(`  ${basename(tgzPath)}... `)
    const pkg = await readPkgFromTgz(tgzPath)
    const extId   = pkg.id ?? pkg.name?.split('/').pop()
    const extType = pkg.extensionType
    if (!extId)   { console.error(`\n  ✗ Sin 'id' en package.json`);            process.exit(1) }
    if (!extType) { console.error(`\n  ✗ Sin 'extensionType' en package.json`); process.exit(1) }

    // La documentacion no se identifica por id (que es el de la extension documentada), sino por el par
    // (targetType, id), asi que su entrada tiene que arrastrar tambien el targetType.
    if (extType === 'docs' && !pkg.targetType) { console.error(`\n  ✗ Sin 'targetType' en package.json (obligatorio en docs)`); process.exit(1) }

    const tgzName = basename(tgzPath)
    copyFileSync(tgzPath, join(pkgDir, tgzName))
    extensions.push({ extensionType: extType, id: extId, tgz: tgzName, ...(extType === 'docs' ? { targetType: pkg.targetType } : {}) })
    console.log(`ok  (${extType}:${extId}${extType === 'docs' ? ` for ${pkg.targetType}` : ''} v${pkg.version ?? '?'})`)
}

// pack's package.json
const packPkgJson = {
    name:          `@kwirthmagnify/${packId}`,
    id:            packId,
    displayName:   opts.name,
    version:       opts.version,
    description:   opts.description,
    extensionType: 'pack',
    ...(opts.website ? { website: opts.website } : {}),
    requiresRestart: false,
    requiresExtension: [],
}
writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(packPkgJson, null, 2))

// pack.json
writeFileSync(join(pkgDir, 'pack.json'), JSON.stringify({ extensions }, null, 2))

// crear el fat tgz
const outputPath = resolve(opts.output)
process.stdout.write(`\nEmpaquetando → ${outputPath}... `)
await tar.c({ gzip: true, file: outputPath, cwd: workDir }, ['package'])
console.log('ok')

rmSync(workDir, { recursive: true, force: true })

// limpiar tgzs temporales generados por --include
for (const t of builtTgzs) { try { rmSync(t) } catch {} }

console.log('\nContenido del pack:')
for (const e of extensions) console.log(`  ${e.extensionType.padEnd(10)} ${e.id}  (${e.tgz})`)
console.log(`\n✓ Pack creado: ${outputPath}`)
