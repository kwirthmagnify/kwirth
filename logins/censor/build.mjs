/**
 * Build script for a login extension.
 * Packs package.json + login.json + background.png (if present) into dist/<id>.tgz
 */
import { mkdirSync, existsSync, copyFileSync, statSync } from 'fs'
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

/*
 * The background has a ceiling and it is not ours: the core stores the installed login in a Kubernetes
 * ConfigMap, which does not go beyond ~1 MiB per object, and the image travels inside IN BASE64 (a third
 * bigger). The core cuts off at 800 KB of base64, that is 600 KB of raw PNG.
 *
 * Going over does not break the install, and that is precisely the bad part: the login installs HALFWAY
 * — with no background — and it only shows when the page is opened. Better it blows up here.
 *
 * If it does not fit: re-encode to a palette (8-bit PNG) rather than cropping the size. A 1200x896
 * truecolor background with gradients drops from 1.9 MB to 430 KB with no visible difference.
 */
const CONFIGMAP_BACKGROUND_LIMIT = 600 * 1024

/*
 * TWO possible backgrounds, and only one has a ceiling:
 *
 *   · background.png    — the one that has to fit ANYWHERE, including a Kubernetes ConfigMap. If it
 *                         goes over, the build fails: it is the only one that guarantees the login
 *                         looks right in any installation.
 *   · background-hi.png — OPTIONAL and with no ceiling. It is used when storage allows it (desktop,
 *                         docker or KWIRTH_STORE); where it does not fit, Kwirth quietly keeps the
 *                         normal one. Not fitting is not a failure: it is exactly what the other one
 *                         exists for.
 */
const bgSrc = join(__dir, 'background.png')
if (existsSync(bgSrc)) {
    const bytes = statSync(bgSrc).size
    if (bytes > CONFIGMAP_BACKGROUND_LIMIT) {
        console.error(`background.png son ${(bytes / 1024).toFixed(0)} KB y el tope es ${CONFIGMAP_BACKGROUND_LIMIT / 1024} KB ` +
            `(${(bytes * 4 / 3 / 1024).toFixed(0)} KB en base64, sobre un limite de 800 KB en el ConfigMap). ` +
            `Si lo que quieres es MAS CALIDAD, deja este dentro del tope y añade background-hi.png, que no lo tiene.`)
        process.exit(1)
    }
    copyFileSync(bgSrc, join(distDir, 'background.png'))
}

const bgHiSrc = join(__dir, 'background-hi.png')
if (existsSync(bgHiSrc)) {
    const hiBytes = statSync(bgHiSrc).size
    console.log(`background-hi.png: ${(hiBytes / 1024).toFixed(0)} KB — se usara donde el almacenamiento lo admita`)
    copyFileSync(bgHiSrc, join(distDir, 'background-hi.png'))
}

// pack into tgz
const tgzName = `${id}.tgz`
execSync(`tar -czf ${tgzName} package.json login.json${existsSync(bgSrc) ? ' background.png' : ''}` +
    `${existsSync(bgHiSrc) ? ' background-hi.png' : ''}`, { cwd: distDir })

console.log(`Built dist/${tgzName}`)
