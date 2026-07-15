/**
 * Watch script for a login extension.
 * Re-packs on changes to package.json, login.json or background.png.
 */
import { watch } from 'fs'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

const FILES = ['package.json', 'login.json', 'background.png']

let building = false
let pending = false

const build = () => {
    if (building) { pending = true; return }
    building = true
    console.log('[watch] Building...')
    const child = spawn('node', ['build.mjs'], { cwd: __dir, stdio: 'inherit' })
    child.on('exit', () => {
        building = false
        if (pending) { pending = false; build() }
    })
}

build()

for (const file of FILES) {
    watch(__dir, { persistent: true }, (event, filename) => {
        if (FILES.includes(filename ?? '')) build()
    })
    break // one watcher on the dir is enough
}

console.log('[watch] Watching for changes...')
