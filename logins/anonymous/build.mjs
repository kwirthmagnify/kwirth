import { mkdirSync, copyFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(__dir, 'package.json'), 'utf-8'))
const id = pkg.id ?? pkg.name.split('/').pop()
const distDir = join(__dir, 'dist')

mkdirSync(distDir, { recursive: true })
copyFileSync(join(__dir, 'package.json'), join(distDir, 'package.json'))
copyFileSync(join(__dir, 'login.json'), join(distDir, 'login.json'))

execSync(`tar -czf ${id}.tgz package.json login.json`, { cwd: distDir })
console.log(`[build] ${id} v${pkg.version} packed → dist/${id}.tgz`)
