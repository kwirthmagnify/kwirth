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
 * El fondo tiene un tope y no es nuestro: el core guarda el login instalado en un ConfigMap de
 * Kubernetes, que no pasa de ~1 MiB por objeto, y la imagen viaja dentro EN BASE64 (un tercio mas
 * grande). El core corta en 800 KB de base64, o sea 600 KB de PNG en crudo.
 *
 * Pasarse no rompe la instalacion, y eso es justo lo malo: el login se instala A MEDIAS —sin fondo—
 * y solo se nota al abrir la pagina. Mejor que reviente aqui.
 *
 * Si no cabe: reencodear a paleta (PNG de 8 bits) antes que recortar el tamano. Un fondo de 1200x896
 * en truecolor con degradados baja de 1,9 MB a 430 KB sin diferencia apreciable.
 */
const CONFIGMAP_BACKGROUND_LIMIT = 600 * 1024

const bgSrc = join(__dir, 'background.png')
if (existsSync(bgSrc)) {
    const bytes = statSync(bgSrc).size
    if (bytes > CONFIGMAP_BACKGROUND_LIMIT) {
        console.error(`background.png son ${(bytes / 1024).toFixed(0)} KB y el tope es ${CONFIGMAP_BACKGROUND_LIMIT / 1024} KB ` +
            `(${(bytes * 4 / 3 / 1024).toFixed(0)} KB en base64, sobre un limite de 800 KB en el ConfigMap).`)
        process.exit(1)
    }
    copyFileSync(bgSrc, join(distDir, 'background.png'))
}

// pack into tgz
const tgzName = `${id}.tgz`
execSync(`tar -czf ${tgzName} package.json login.json${existsSync(bgSrc) ? ' background.png' : ''}`, { cwd: distDir })

console.log(`Built dist/${tgzName}`)
