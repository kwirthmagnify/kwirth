#!/usr/bin/env node
/**
 * Prepares the Docker build context with bundled extensions support and runs docker build.
 * Usage (from docker/ directory): node build-image.mjs [image-tag] [bundled-manifest]
 * Default tag: kwirth. Default manifest: back/kwirth-bundled-full.json
 *
 * The manifest is the ONLY thing that separates the image variants (-core / -readonly / -full): same
 * Dockerfile, same core, different set of bundled extensions. It is named by file (resolved inside
 * back/) and is always copied to the context under the fixed name the Dockerfile expects, so the
 * Dockerfile never has to know which variant is being built.
 */

import { execSync } from 'child_process'
import { copyFileSync, rmSync, existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const tag = process.argv[2] ?? 'kwirth'
const manifestName = process.argv[3] ?? 'kwirth-bundled-full.json'

const manifestSrc = join(root, 'back', manifestName)
const scriptSrc   = join(root, 'tools', 'scripts', 'fetch-bundled.mjs')
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

/*
    The manifest goes into the context RESOLVED: every "latest" already turned into the URL of the newest
    version, here on the host. Resolving it inside the Dockerfile would leave the RUN layer cached with
    whatever was newest the first time, since neither the manifest nor the script would have changed;
    resolved here, a new version changes the COPY and the layer is rebuilt.
*/
try {
    execSync(`node "${scriptSrc}" "${manifestSrc}" --resolve "${manifestDst}"`, { stdio: 'inherit' })
}
catch {
    console.error(`[build-image] ERROR: could not resolve ${manifestName}.`)
    process.exit(1)
}
copyFileSync(scriptSrc, scriptDst)
console.log(`[build-image] Bundled extensions manifest (${manifestName}, resolved) and script copied to docker context.`)

try {
    execSync(`docker build -t ${tag} .`, { stdio: 'inherit', cwd: __dirname })
} finally {
    if (existsSync(manifestDst)) unlinkSync(manifestDst)
    if (existsSync(scriptDst))   unlinkSync(scriptDst)
}
