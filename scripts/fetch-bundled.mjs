#!/usr/bin/env node
/**
 * Downloads (or copies) bundled extensions declared in back/kwirth-bundled.json.
 * URL entries are downloaded via HTTP/HTTPS.
 * Local path entries (relative, or not starting with http) are resolved relative
 * to the manifest file's directory and copied into the output directory.
 *
 * Usage: node scripts/fetch-bundled.mjs <manifest-path> <output-dir>
 * Example (Electron):  node scripts/fetch-bundled.mjs ../back/kwirth-bundled.json electron/bundled
 * Example (Tauri):     node scripts/fetch-bundled.mjs ../back/kwirth-bundled.json tauri/resources/bundled
 * Example (Docker):    node scripts/fetch-bundled.mjs kwirth-bundled.json /usr/kwirth/bundled
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync, copyFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import https from 'https'
import http from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? join(__dirname, '..', 'back', 'kwirth-bundled.json'))
const manifestDir = dirname(manifestPath)
const outputDir = resolve(process.argv[3] ?? 'bundled')

const EXTENSION_TYPES = ['plugins', 'providers', 'senders', 'homepages', 'themes', 'idps', 'docs']

const downloadFile = (url, destPath) => new Promise((res, rej) => {
    const protocol = url.startsWith('https') ? https : http
    const file = createWriteStream(destPath)
    const get = (targetUrl) => {
        protocol.get(targetUrl, { headers: { 'User-Agent': 'kwirth-build/1.0' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close()
                return get(response.headers.location)
            }
            if (response.statusCode !== 200) {
                file.close()
                return rej(new Error(`HTTP ${response.statusCode} downloading ${targetUrl}`))
            }
            response.pipe(file)
            file.on('finish', () => { file.close(); res() })
        }).on('error', err => { file.close(); rej(err) })
    }
    get(url)
})

const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

let total = 0
for (const type of EXTENSION_TYPES) {
    total += Object.keys(manifest[type] ?? {}).length
}

mkdirSync(outputDir, { recursive: true })

if (total === 0) {
    console.log('[bundled] No extensions declared in manifest — nothing to download.')
    writeFileSync(join(outputDir, '.keep'), '')
    process.exit(0)
}

for (const type of EXTENSION_TYPES) {
    const entries = manifest[type] ?? {}
    for (const [id, url] of Object.entries(entries)) {
        const filename = `${id}.tgz`
        const destPath = join(outputDir, filename)
        if (existsSync(destPath)) {
            console.log(`[bundled] ${type}/${id} already exists — skipping.`)
            continue
        }
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
