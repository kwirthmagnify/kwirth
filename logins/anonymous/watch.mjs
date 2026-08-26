import { watch } from 'fs'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const FILES = ['package.json', 'login.json']

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

watch(__dir, { persistent: true }, (_event, filename) => {
    if (FILES.includes(filename ?? '')) build()
})

console.log('[watch] Watching for changes...')
