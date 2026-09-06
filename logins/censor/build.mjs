/**
 * Build script for a login extension.
 * Packs package.json + login.json + background.png (if present) into dist/<id>.tgz
 */
import { mkdirSync, existsSync, copyFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dir = dirname(fileURLToPath(import.meta.url))

const pkg = JSON.parse(await readFile(join(__dir, 'package.json'), 'utf-8'))
const id = pkg.id ?? pkg.name.split('/').pop()

const distDir = join(__dir, 'dist')
mkdirSync(distDir, { recursive: true })

// copy required files
copyFileSync(join(__dir, 'package.json'), join(distDir, 'package.json'))
copyFileSync(join(__dir, 'login.json'), join(distDir, 'login.json'))

const bgSrc = join(__dir, 'background.png')
if (existsSync(bgSrc)) copyFileSync(bgSrc, join(distDir, 'background.png'))

// pack into tgz
const tgzName = `${id}.tgz`
execSync(`tar -czf ${tgzName} package.json login.json${existsSync(bgSrc) ? ' background.png' : ''}`, { cwd: distDir })

console.log(`Built dist/${tgzName}`)
