#!/usr/bin/env node
/**
 * Creates a pack tgz out of extension tgzs.
 *
 * Usage:
 *   node packs/create-pack.mjs <pack-id> [options] [tgz1 tgz2 ...]
 *
 * Options:
 *   --include type:name     Builds + packages the extension and includes it in the pack.
 *                           It can be repeated. Types: plugin, provider, sender, theme,
 *                           homepage, idp, login.
 *   --name        The pack's display name             (default: pack-id)
 *   --version     The pack's version                  (default: 1.0.0)
 *   --description Description                         (default: "")
 *   --website     The pack's website URL              (default: "")
 *   --output      Path of the output tgz              (default: <id>-<version>.pack.tgz)
 *
 * Examples:
 *   # From already built tgzs
 *   node packs/create-pack.mjs my-pack ./themes/avicii/dist/avicii.tgz \
 *     --name "My Pack" --version "1.0.0"
 *
 *   # Builds and packages automatically
 *   node packs/create-pack.mjs my-pack \
 *     --include theme:avicii --include homepage:matrix \
 *     --name "My Pack" --version "1.0.0"
 *
 *   # Mixed: some --include and some already built tgz
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
    webhook:  'webhooks',
    // 'docs' has no folder of its own: every plugin generates its tgz with build-docs-tgz.mjs, so the
    // documentation is passed as a loose tgz path, not with --include.
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
// The file is named after the package too, so what is on disk and what is published say the same thing.
opts.output = opts.output ?? `kwirth-pack-${packId}-${opts.version}.tgz`

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

// Step 1: process --include (build + pack)
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

// Step 2: build the pack
const workDir = join(tmpdir(), `pack-build-${Date.now()}`)
const pkgDir  = join(workDir, 'package')
mkdirSync(pkgDir, { recursive: true })

const extensions = []
// For the README only: 'pack.json' identifies a member by its tgz, not by a version field.
const members = []
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

    // Documentation is not identified by id (which is the documented extension's), but by the pair
    // (targetType, id), so its entry has to carry the targetType along too.
    if (extType === 'docs' && !pkg.targetType) { console.error(`\n  ✗ Sin 'targetType' en package.json (obligatorio en docs)`); process.exit(1) }

    const tgzName = basename(tgzPath)
    copyFileSync(tgzPath, join(pkgDir, tgzName))
    extensions.push({ extensionType: extType, id: extId, tgz: tgzName, ...(extType === 'docs' ? { targetType: pkg.targetType } : {}) })
    members.push({ extensionType: extType, id: extId, version: pkg.version ?? '?' })
    console.log(`ok  (${extType}:${extId}${extType === 'docs' ? ` for ${pkg.targetType}` : ''} v${pkg.version ?? '?'})`)
}

// pack's package.json
//
// The name follows the same 'kwirth-<type>-<id>' pattern as every other extension type. It used to be
// just '@kwirthmagnify/<packId>', which put a package named after nothing in particular ('censor') at the
// top of the scope, next to the core's own packages.
const packPkgJson = {
    name:          `@kwirthmagnify/kwirth-pack-${packId}`,
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

/*
    The package page on npm is this README: publishing without it leaves a page that says nothing.
    A hand written 'packs/<id>.README.md' wins; otherwise one is generated from what the pack already
    knows, so that no pack can be published without it.
*/
const ownReadme = join('packs', `${packId}.README.md`)
if (existsSync(ownReadme)) {
    copyFileSync(ownReadme, join(pkgDir, 'README.md'))
}
else {
    const rows = members.map(e => `| ${e.extensionType} | \`${e.id}\` | ${e.version} |`).join('\n')
    writeFileSync(join(pkgDir, 'README.md'),
        `# ${opts.name ?? packId}\n\n` +
        `A pack for **[Kwirth](https://kwirthmagnify.dev)**: several extensions installed together, as one.\n\n` +
        (opts.description ? `${opts.description}\n\n` : '') +
        `> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events\n` +
        `> and more, in real time, extended with plugins.\n` +
        `> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**\n\n` +
        `## What it installs\n\n| Type | Id | Version |\n|---|---|---|\n${rows}\n\n` +
        `## Installing it\n\nFrom Kwirth: **☰ → Manage extensions → Packs**, find it in the marketplace and\n` +
        `install it. Every member is validated before any of them is installed, so a pack either goes in\n` +
        `whole or not at all.\n`)
}

// crear el fat tgz
const outputPath = resolve(opts.output)
process.stdout.write(`\nEmpaquetando → ${outputPath}... `)
await tar.c({ gzip: true, file: outputPath, cwd: workDir }, ['package'])
console.log('ok')

rmSync(workDir, { recursive: true, force: true })

// clean up the temporary tgz files generated by --include
for (const t of builtTgzs) { try { rmSync(t) } catch {} }

console.log('\nContenido del pack:')
for (const e of extensions) console.log(`  ${e.extensionType.padEnd(10)} ${e.id}  (${e.tgz})`)
console.log(`\n✓ Pack creado: ${outputPath}`)
