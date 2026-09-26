#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

/*
    Scaffold de una extension de LOGIN.

    Hasta ahora un login se creaba copiando `logins/_template/` a mano y cambiando los nombres dentro,
    que es exactamente donde se cuelan los despistes: el id en un sitio y el nombre del tgz en otro.

    Un login no lleva codigo —ni TypeScript ni esbuild—, solo `login.json` y sus imagenes, asi que este
    scaffold es mas corto que el de un plugin o un tema. Lo que si trae es el build ya resuelto: los DOS
    fondos, con el tope aplicado al que tiene que caber en cualquier sitio.
*/

// Non-interactive mode: as soon as --id arrives nothing is asked, useful for CI and for repeating a scaffold.
const argv = process.argv.slice(2)
const flag = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
}

if (argv.includes('--help')) {
    console.log(`
Usage: node tools/create-kwirth-login.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>
  --name <text>
  --description <text>
  --title <text>            heading shown on the login page
  --website <url>
  --help                    this text
`)
    process.exit(0)
}

const interactive = !flag('id')
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
const ask = (q, def) => interactive
    ? rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')
    : Promise.resolve(def || '')

if (interactive) console.log('\n── Kwirth login scaffold ───────────────────────────────────\n')

const id          = flag('id') ?? await ask('Login ID (kebab-case, e.g. my-login)')
const displayName = flag('name') ?? await ask('Display name', id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))
const description = flag('description') ?? await ask('Description', `${displayName} login page for Kwirth`)
const title       = flag('title') ?? await ask('Title shown on the page', displayName)
const website     = flag('website') ?? await ask('Website URL (optional)', '')
if (rl) rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Login ID must be lowercase kebab-case (e.g. my-login)')
    process.exit(1)
}

const loginDir = path.resolve('logins', id)

if (fs.existsSync(loginDir)) {
    console.error(`Error: Directory already exists: ${loginDir}`)
    process.exit(1)
}

fs.mkdirSync(loginDir, { recursive: true })

// ─── package.json ──────────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "name": "@kwirthmagnify/login-${id}",
    "id": "${id}",
    "displayName": "${displayName}",
    "version": "0.1.0",
    "files": [
        "login.json",
        "background.png",
        "background-hi.png"
    ],
    "description": "${description}",
    "extensionType": "login",${websiteLine}
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs"
    },
    "requiresRestart": false,
    "requiresExtension": []
}
`)

// ─── login.json ────────────────────────────────────────────────────────────────

write('login.json', `{
    "top": "50%",
    "left": "50%",
    "width": "320px",
    "height": "",
    "pageBackground": "#1a1a2e",
    "dialogBackground": "rgba(0,0,0,0.55)",
    "textColor": "#ffffff",
    "title": "${title}",
    "userLabel": "User",
    "passwordLabel": "Password",
    "newPasswordLabel": "New password",
    "repeatPasswordLabel": "Repeat new password",
    "changePasswordMessage": "Your login has been successful, you can now change your password.",
    "changePasswordButton": "Change password",
    "okButton": "Login",
    "orSeparator": "or",
    "idpButton": "Log in with...",
    "startChannel": "",
    "allowedIdps": []
}
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────────

write('build.mjs', `/**
 * Build script for a login extension.
 * Packs package.json + login.json + background.png + background-hi.png (si existen) into dist/<id>.tgz
 */
import { mkdirSync, existsSync, copyFileSync, statSync } from 'fs'
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

/*
 * TWO possible backgrounds, and only one has a ceiling:
 *
 *   · background.png    — the one that has to fit ANYWHERE, including a Kubernetes ConfigMap, which
 *                         does not go beyond ~1 MiB per object and stores the image IN BASE64 (a third
 *                         bigger). The core cuts off at 800 KB of base64, that is ~600 KB of PNG. Go
 *                         over and this build fails on purpose: going over does not break the install —
 *                         and that is the bad part — the login installs HALFWAY, with no background,
 *                         and it only shows when you open it.
 *   · background-hi.png — OPTIONAL and with no ceiling. It is used wherever storage allows it (desktop,
 *                         docker or KWIRTH_STORE); where it does not fit, Kwirth keeps the normal one.
 *                         Not fitting is NOT a failure: it is exactly what the other one exists for.
 *
 * If the normal one does not fit: re-encode to a palette (8-bit PNG) rather than cropping the size. A
 * 1200x896 truecolor background with gradients drops from 1.9 MB to 430 KB with no visible difference.
 */
const CONFIGMAP_BACKGROUND_LIMIT = 600 * 1024

const bgSrc = join(__dir, 'background.png')
if (existsSync(bgSrc)) {
    const bytes = statSync(bgSrc).size
    if (bytes > CONFIGMAP_BACKGROUND_LIMIT) {
        console.error(\`background.png son \${(bytes / 1024).toFixed(0)} KB y el tope es \${CONFIGMAP_BACKGROUND_LIMIT / 1024} KB \` +
            \`(\${(bytes * 4 / 3 / 1024).toFixed(0)} KB en base64, sobre un limite de 800 KB en el ConfigMap). \` +
            \`Si lo que quieres es MAS CALIDAD, deja este dentro del tope y añade background-hi.png, que no lo tiene.\`)
        process.exit(1)
    }
    copyFileSync(bgSrc, join(distDir, 'background.png'))
}

const bgHiSrc = join(__dir, 'background-hi.png')
if (existsSync(bgHiSrc)) {
    const hiBytes = statSync(bgHiSrc).size
    console.log(\`background-hi.png: \${(hiBytes / 1024).toFixed(0)} KB — se usara donde el almacenamiento lo admita\`)
    copyFileSync(bgHiSrc, join(distDir, 'background-hi.png'))
}

const tgzName = \`\${id}.tgz\`
execSync(\`tar -czf \${tgzName} package.json login.json\${existsSync(bgSrc) ? ' background.png' : ''}\` +
    \`\${existsSync(bgHiSrc) ? ' background-hi.png' : ''}\`, { cwd: distDir })

console.log(\`Built dist/\${tgzName}\`)
`)

// ─── watch.mjs ─────────────────────────────────────────────────────────────────

write('watch.mjs', `/**
 * Watch script for a login extension.
 * Re-packs on changes to package.json, login.json or either background.
 */
import { watch } from 'fs'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

const FILES = ['package.json', 'login.json', 'background.png', 'background-hi.png']

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
`)

// ─── README.md ─────────────────────────────────────────────────────────────────

write('README.md', `# ${displayName} — Kwirth login extension

${description}

## What it is

A login extension replaces the standard Kwirth login dialog with a **custom-branded page**: its own
background, colours, labels and — the part that is easy to miss — the channel that opens right after a
successful login. The page itself is rendered by Kwirth; this extension only supplies its configuration
and images.

## Files

| File | Required | Purpose |
|---|---|---|
| \`package.json\` | yes | id, version and metadata |
| \`login.json\` | yes | colours, position, labels, \`startChannel\`, allowed IdPs |
| \`background.png\` | optional | full-screen background — **keep it under ~600 KB** |
| \`background-hi.png\` | optional | the same image at full quality, with **no size limit** |

### Why two backgrounds

Kwirth stores an installed login inside its own record, and how big that record can be depends on where
it is stored: a Kubernetes **ConfigMap** tops out at ~1 MiB, while filesystem storage (desktop, Docker or
\`KWIRTH_STORE\`) has no such ceiling. Since the extension cannot know where it will land, it may ship
both: Kwirth keeps \`background-hi.png\` when it fits, falls back to \`background.png\` when it does not,
and — if neither fits — installs without a background and says so on the page.

⚠️ The choice is made **when the extension is installed**. If the installation later moves to filesystem
storage, reinstall the login to pick up the high-quality image.

## Build

\`\`\`bash
npm run build     # writes dist/${id}.tgz
npm run watch     # rebuilds on every change
\`\`\`

To try it without installing, add it to \`back/kwirth-dev.json\` under \`logins\` and open
\`?loginExt=${id}\`. In dev the background is read straight from the tgz, so the size limit does not
apply — which is also why an oversized image looks fine there and only fails once installed for real.
`)

console.log(`
✓ Login extension '${id}' created at logins/${id}

Next steps:
  cd logins/${id}
  # drop your background.png (≤ ~600 KB) and, if you want, background-hi.png
  npm run build        # one-shot build
  npm run watch        # dev mode
  cd dist
  npm publish --access=public   # publish to npmjs
`)

// ─── helpers ───────────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(loginDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
