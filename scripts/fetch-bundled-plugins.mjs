#!/usr/bin/env node
/**
 * Downloads bundled plugins declared in back/kwirth-bundled-plugins.json.
 * Usage: node scripts/fetch-bundled-plugins.mjs <output-dir>
 * Example (Electron):  node scripts/fetch-bundled-plugins.mjs electron/bundled-plugins
 * Example (Tauri):     node scripts/fetch-bundled-plugins.mjs tauri/resources/bundled-plugins
 * Example (Docker):    node scripts/fetch-bundled-plugins.mjs /usr/kwirth/bundled-plugins
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import https from 'https'
import http from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? join(__dirname, '..', 'back', 'kwirth-bundled-plugins.json'))
const outputDir = resolve(process.argv[3] ?? 'bundled-plugins')

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

if (!manifest.plugins?.length) {
    console.log('[bundled-plugins] No plugins declared in manifest — nothing to download.')
    process.exit(0)
}

mkdirSync(outputDir, { recursive: true })

for (const plugin of manifest.plugins) {
    const filename = `${plugin.id}-${plugin.version}.tgz`
    const destPath = join(outputDir, filename)
    if (existsSync(destPath)) {
        console.log(`[bundled-plugins] ${filename} already exists — skipping.`)
        continue
    }
    console.log(`[bundled-plugins] Downloading ${plugin.id} v${plugin.version} ...`)
    try {
        await downloadFile(plugin.url, destPath)
        console.log(`[bundled-plugins] ${filename} downloaded.`)
    } catch (err) {
        console.error(`[bundled-plugins] ERROR downloading ${plugin.id}: ${err.message}`)
        process.exit(1)
    }
}

console.log('[bundled-plugins] Done.')
