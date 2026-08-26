import { spawn } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const loginsDir = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

const logins = readdirSync(loginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(loginsDir, d.name, 'watch.mjs')) && existsSync(join(loginsDir, d.name, 'package.json')))
    .map(d => d.name)

const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[32m', '\x1b[34m', '\x1b[31m', '\x1b[37m', '\x1b[96m', '\x1b[93m']
const RESET = '\x1b[0m'

const pad = Math.max(...logins.map(s => s.length))

console.log(`[watch-all] Starting watchers for: ${logins.join(', ')}\n`)

logins.forEach((name, i) => {
    const color = COLORS[i % COLORS.length]
    const prefix = `${color}[${name.padEnd(pad)}]${RESET} `
    const cwd = join(loginsDir, name)

    const child = spawn('node', ['watch.mjs'], { cwd, shell: false })

    child.stdout.on('data', data => {
        data.toString().split('\n').filter(l => l.trim()).forEach(line => process.stdout.write(prefix + line + '\n'))
    })
    child.stderr.on('data', data => {
        data.toString().split('\n').filter(l => l.trim()).forEach(line => process.stderr.write(prefix + line + '\n'))
    })
    child.on('exit', code => {
        console.error(`${prefix}exited with code ${code}`)
    })
})
