import { mkdirSync, copyFileSync, readdirSync, rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(__dir, 'package.json'), 'utf-8'))
const id = pkg.id ?? pkg.name.split('/').pop()
const distDir = join(__dir, 'dist')

/*  Named like every other extension type: '<scope>-<type>-<id>-<version>', which is exactly what
    `npm pack` would produce for @scope/login-<id>. It used to be just '<id>.tgz', the one name that says
    nothing about what the file is, and then 'kwirth-login-<id>.tgz', which still had no version.

    🔴 The SCOPE is derived from package.json, never typed: there are three houses and two of them are
    public, so a literal here is a paid login announcing itself as OSS. */
const scope = (pkg.publisher ?? pkg.name.split('/')[0]).replace(/^@/, '')
const tgzName = `${scope}-login-${id}-${pkg.version}.tgz`

mkdirSync(distDir, { recursive: true })
copyFileSync(join(__dir, 'package.json'), join(distDir, 'package.json'))
copyFileSync(join(__dir, 'login.json'), join(distDir, 'login.json'))

// Previous tarballs out: with the version in the name they pile up, and whoever grabs "the tgz in dist"
// could walk off with a previous one without noticing.
for (const f of readdirSync(distDir)) if (f.endsWith('.tgz')) rmSync(join(distDir, f))
execSync(`tar -czf ${tgzName} package.json login.json`, { cwd: distDir })
console.log(`[build] ${id} v${pkg.version} packed → dist/${tgzName}`)
