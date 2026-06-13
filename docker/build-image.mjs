#!/usr/bin/env node
/**
 * Prepares the Docker build context with bundled extensions support and runs docker build.
 * Usage (from docker/ directory): node build-image.mjs [image-tag]
 * Default tag: kwirth
 */

import { execSync } from 'child_process'
import { copyFileSync, rmSync, existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const tag = process.argv[2] ?? 'kwirth'

const manifestSrc = join(root, 'back', 'kwirth-bundled.json')
const scriptSrc   = join(root, 'scripts', 'fetch-bundled.mjs')
const manifestDst = join(__dirname, 'kwirth-bundled.json')
const scriptDst   = join(__dirname, 'fetch-bundled.mjs')

if (!existsSync(manifestSrc)) {
    console.error(`[build-image] ERROR: ${manifestSrc} not found.`)
    process.exit(1)
}
if (!existsSync(scriptSrc)) {
    console.error(`[build-image] ERROR: ${scriptSrc} not found.`)
    process.exit(1)
}

copyFileSync(manifestSrc, manifestDst)
copyFileSync(scriptSrc, scriptDst)
console.log('[build-image] Bundled extensions manifest and script copied to docker context.')

try {
    execSync(`docker build -t ${tag} .`, { stdio: 'inherit', cwd: __dirname })
} finally {
    if (existsSync(manifestDst)) unlinkSync(manifestDst)
    if (existsSync(scriptDst))   unlinkSync(scriptDst)
}
