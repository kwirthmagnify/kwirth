#!/usr/bin/env node
/**
 * Downloads (or copies) the bundled extensions declared in a back/kwirth-bundled*.json.
 *
 * Each entry is one of:
 *   - "latest"          resolved AT BUILD TIME to the newest version in the public marketplace manifest of
 *                       its type (the same manifest the core's marketplace reads), then downloaded
 *   - an http(s) URL    downloaded as is — a deliberate pin
 *   - a local path      resolved relative to the manifest file's directory and copied (the core's guide)
 *
 * Usage: node tools/scripts/fetch-bundled.mjs <manifest-path> <output-dir>
 *        node tools/scripts/fetch-bundled.mjs <manifest-path> --resolve <resolved-manifest-path>
 * Example (Electron):  node ../tools/scripts/fetch-bundled.mjs ../back/kwirth-bundled.json bundled
 * Example (Tauri):     node ../tools/scripts/fetch-bundled.mjs ../back/kwirth-bundled.json resources/bundled
 * Example (Docker):    node fetch-bundled.mjs kwirth-bundled.json /usr/kwirth/bundled
 *
 * '--resolve' writes the same manifest with every "latest" replaced by its URL and downloads nothing.
 * docker/build-image.mjs uses it on the host, so the image is built from pinned URLs: a "latest" inside
 * the Dockerfile would leave the RUN layer cached with whatever was latest the first time.
 *
 * Docker's carries no path on purpose: the build copies this file INTO docker/ and the image runs it
 * from there (see docker/build-image.mjs and the Dockerfile's COPY).
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from 'fs'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import https from 'https'
import http from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? join(__dirname, '..', 'back', 'kwirth-bundled.json'))
const manifestDir = dirname(manifestPath)
const resolveOnly = process.argv[3] === '--resolve'
const resolvedPath = resolveOnly ? resolve(process.argv[4] ?? 'kwirth-bundled.resolved.json') : undefined
const outputDir = resolveOnly ? undefined : resolve(process.argv[3] ?? 'bundled')

/*
    Every family the core installs from the bundled directory. 'dces' and 'aitoolsets' were missing: the
    core knew how to install them and this never fetched them (Magnify needs the 'file-manager' DCE).
    The key is also the folder of the family's public manifest (see MarketplaceManager.ts, PUBLIC_FOLDER).
*/
const EXTENSION_TYPES = ['dces', 'providers', 'plugins', 'senders', 'homepages', 'logins', 'themes', 'idps', 'aitoolsets', 'docs']

// The public marketplace, the same base the core's MarketplaceManager reads.
const PUBLIC_BASE = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master'
const LATEST = 'latest'

const request = (url, onResponse) => new Promise((res, rej) => {
    const protocol = url.startsWith('https') ? https : http
    const get = (targetUrl) => {
        protocol.get(targetUrl, { headers: { 'User-Agent': 'kwirth-build/1.0' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume()
                return get(response.headers.location)
            }
            if (response.statusCode !== 200) {
                response.resume()
                return rej(new Error(`HTTP ${response.statusCode} downloading ${targetUrl}`))
            }
            onResponse(response, res, rej)
        }).on('error', rej)
    }
    get(url)
})

const downloadFile = (url, destPath) => request(url, (response, res, rej) => {
    const file = createWriteStream(destPath)
    response.pipe(file)
    file.on('finish', () => { file.close(); res() })
    file.on('error', rej)
})

const fetchJson = (url) => request(url, (response, res, rej) => {
    let body = ''
    response.setEncoding('utf-8')
    response.on('data', chunk => body += chunk)
    response.on('end', () => { try { res(JSON.parse(body)) } catch (err) { rej(new Error(`invalid JSON at ${url}: ${err.message}`)) } })
})

// Numeric x.y.z comparison: '0.2.10' is newer than '0.2.9', which a string comparison gets wrong.
const compareVersions = (a, b) => {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d !== 0) return d
    }
    return 0
}

/*
    The newest version the public marketplace offers for this id. The manifest and not npm's 'latest' tag:
    a version withdrawn from the manifest (because it was broken) is still the newest one on npm, and an
    image must not carry what the marketplace no longer offers.
*/
const publicManifests = new Map()
const resolveLatest = async (type, id) => {
    if (!publicManifests.has(type)) publicManifests.set(type, await fetchJson(`${PUBLIC_BASE}/${type}/manifest.json`))
    const entries = (publicManifests.get(type) ?? []).filter(e => e?.id === id && e?.url)
    if (entries.length === 0) throw new Error(`${type}/${id} is not in the public ${type} manifest`)
    return entries.reduce((best, e) => compareVersions(e.version, best.version) > 0 ? e : best)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

// Every "latest" becomes a URL first, so that what is downloaded and what is logged are the same thing.
for (const type of EXTENSION_TYPES) {
    const entries = manifest[type] ?? {}
    for (const [id, source] of Object.entries(entries)) {
        if (source !== LATEST) continue
        try {
            const entry = await resolveLatest(type, id)
            entries[id] = entry.url
            console.log(`[bundled] ${type}/${id} -> ${entry.version}`)
        }
        catch (err) {
            console.error(`[bundled] ERROR resolving ${type}/${id}: ${err.message}`)
            process.exit(1)
        }
    }
}

if (resolveOnly) {
    writeFileSync(resolvedPath, JSON.stringify(manifest, null, 2))
    console.log(`[bundled] Resolved manifest written to ${resolvedPath}`)
    process.exit(0)
}

let total = 0
for (const type of EXTENSION_TYPES) {
    total += Object.keys(manifest[type] ?? {}).length
}

mkdirSync(outputDir, { recursive: true })

/*
    The output directory is emptied of bundles first. It used to skip a file that already existed, so a
    desktop build directory kept whatever it had downloaded the first time — old versions, and files
    under names this script no longer writes ('events.tgz' next to 'providers-events.tgz'), all of which
    the core then installed.
*/
for (const name of readdirSync(outputDir)) {
    if (name.endsWith('.tgz')) unlinkSync(join(outputDir, name))
}

if (total === 0) {
    console.log('[bundled] No extensions declared in manifest — nothing to download.')
    writeFileSync(join(outputDir, '.keep'), '')
    process.exit(0)
}

for (const type of EXTENSION_TYPES) {
    const entries = manifest[type] ?? {}
    for (const [id, url] of Object.entries(entries)) {
        /*
            The TYPE goes into the name: two extensions of different families can share an id (the
            'metrics' plugin and the 'metrics' provider), and '<id>.tgz' made the second one overwrite the
            first. The core reads the id and the type from each package, not from the name.
        */
        const filename = `${type}-${id}.tgz`
        const destPath = join(outputDir, filename)
        const isRemote = url.startsWith('http://') || url.startsWith('https://')
        if (isRemote) {
            console.log(`[bundled] Downloading ${type}/${id} ...`)
            try {
                await downloadFile(url, destPath)
                console.log(`[bundled] ${filename} downloaded.`)
            }
            catch (err) {
                console.error(`[bundled] ERROR downloading ${type}/${id}: ${err.message}`)
                process.exit(1)
            }
        }
        else {
            const localSrc = resolve(manifestDir, url)
            if (!existsSync(localSrc)) {
                console.error(`[bundled] ERROR: local bundle for ${type}/${id} not found at ${localSrc}`)
                process.exit(1)
            }
            console.log(`[bundled] Copying ${type}/${id} from local path ...`)
            try {
                copyFileSync(localSrc, destPath)
                console.log(`[bundled] ${filename} copied.`)
            }
            catch (err) {
                console.error(`[bundled] ERROR copying ${type}/${id}: ${err.message}`)
                process.exit(1)
            }
        }
    }
}

console.log('[bundled] Done.')
