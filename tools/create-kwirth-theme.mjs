#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def) => rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')

console.log('\n── Kwirth theme scaffold ───────────────────────────────────\n')

const id          = await ask('Theme ID (kebab-case, e.g. my-theme)')
const displayName = await ask('Display name', id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))
const description = await ask('Description', `${displayName} theme for Kwirth`)
const website     = await ask('Website URL (optional)', '')
rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Theme ID must be lowercase kebab-case (e.g. my-theme)')
    process.exit(1)
}

const themeDir = path.resolve('themes', id)

if (fs.existsSync(themeDir)) {
    console.error(`Error: Directory already exists: ${themeDir}`)
    process.exit(1)
}

fs.mkdirSync(path.join(themeDir, 'src', 'front'), { recursive: true })

// ─── package.json ──────────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "id": "${id}",
    "name": "@kwirthmagnify/kwirth-theme-${id}",
    "publisher": "@kwirthmagnify",
    "version": "0.1.0",
    "displayName": "${displayName}",
    "extensionType": "theme",
    "description": "${description}",${websiteLine}
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs"
    },
    "devDependencies": {
        "@types/node": "^20.12.13",
        "esbuild": "^0.27.2",
        "typescript": "^5.4.0"
    }
}
`)

// ─── tsconfig.json ─────────────────────────────────────────────────────────────

write('tsconfig.json', `{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "noEmit": true
    },
    "include": ["src"]
}
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────────

write('build.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    extensionType: 'theme',
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {})
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

if (fs.existsSync('preview.png')) {
    fs.copyFileSync('preview.png', path.join('dist', 'preview.png'))
    console.log('Copied preview.png')
}

console.log(\`Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.\`)
console.log(\`Package URL: https://registry.npmjs.org/\${meta.name}/-/\${meta.name.split('/').pop()}-\${meta.version}.tgz\`)
`)

// ─── watch.mjs ─────────────────────────────────────────────────────────────────

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {})
}, null, 2))

if (fs.existsSync('preview.png')) {
    fs.copyFileSync('preview.png', path.join('dist', 'preview.png'))
}

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})

await frontCtx.watch()

console.log('[watch] Watching src/front — front.js rebuilds on every change.')
console.log('[watch] kwirth backend serves the updated front.js automatically (dev mode, no-cache).')
`)

// ─── src/front/index.ts ────────────────────────────────────────────────────────

write('src/front/index.ts', `declare const window: any

window.__kwirth_themes__ = window.__kwirth_themes__ ?? {}
window.__kwirth_themes__['${id}'] = {
    displayName: '${displayName}',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary:   { main: mode === 'dark' ? '#TODO_DARK_PRIMARY'   : '#TODO_LIGHT_PRIMARY' },
            secondary: { main: mode === 'dark' ? '#TODO_DARK_SECONDARY' : '#TODO_LIGHT_SECONDARY' },
            background: {
                default: mode === 'dark' ? '#TODO_DARK_BG'   : '#TODO_LIGHT_BG',
                paper:   mode === 'dark' ? '#TODO_DARK_PAPER' : '#TODO_LIGHT_PAPER',
            },
            text: {
                primary:   mode === 'dark' ? '#TODO_DARK_TEXT'  : '#TODO_LIGHT_TEXT',
                secondary: mode === 'dark' ? '#TODO_DARK_MUTED' : '#TODO_LIGHT_MUTED',
            },
            divider: mode === 'dark' ? '#TODO_DARK_DIVIDER' : '#TODO_LIGHT_DIVIDER',
        },
        shape: { borderRadius: 4 },
        typography: {
            fontFamily: "'TODO_FONT', sans-serif",
            fontSize: 13,
        },
        components: {
            // Add MUI component overrides here
        },
    }),
}
`)

// ─── done ──────────────────────────────────────────────────────────────────────

console.log(`
✓ Theme scaffolded at themes/${id}/

Next steps:
  cd themes/${id}
  npm install
  # Fill in your palette colors in src/front/index.ts
  npm run build        # one-shot build
  npm run watch        # dev mode (hot-reload)
  cd dist
  npm publish --access=public   # publish to npmjs
`)

// ─── helpers ───────────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(themeDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
