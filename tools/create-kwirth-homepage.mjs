#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def) => rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')

console.log('\n── Kwirth homepage scaffold ────────────────────────────────\n')

const id          = await ask('Homepage ID (kebab-case, e.g. my-homepage)')
const displayName = await ask('Display name', id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))
const description = await ask('Description', `${displayName} homepage for Kwirth`)
const website     = await ask('Website URL (optional)', '')
rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Homepage ID must be lowercase kebab-case (e.g. my-homepage)')
    process.exit(1)
}

const className   = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const homepageDir = path.resolve('homepages', id)

if (fs.existsSync(homepageDir)) {
    console.error(`Error: Directory already exists: ${homepageDir}`)
    process.exit(1)
}

fs.mkdirSync(path.join(homepageDir, 'src', 'front'), { recursive: true })

// ─── package.json ──────────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "id": "${id}",
    "name": "@kwirthmagnify/kwirth-homepage-${id}",
    "displayName": "${displayName}",
    "extensionType": "homepage",
    "publisher": "@kwirthmagnify",
    "version": "0.1.0",
    "description": "${description}",${websiteLine}
    "requiresRestart": false,
    "requiresExtension": [],
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs"
    },
    "devDependencies": {
        "@kwirthmagnify/kwirth-common-front": "^0.5.16",
        "@mui/icons-material": "7.1.2",
        "@mui/material": "7.1.2",
        "@types/react": "^18.3.0",
        "esbuild": "^0.27.2",
        "react": "^18.3.0",
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
        "lib": ["ES2020", "DOM"],
        "jsx": "react",
        "noEmit": true,
        "skipLibCheck": true
    },
    "include": ["src"]
}
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────────

write('build.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            'recharts': 'window.__kwirth__.recharts',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(\`^\${pkg.replace(/[.*+?^\$\{\}()|[\\\\]\\\\]/g, '\\\\$&')}$\`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`const _m = \${globals[args.path]}; let _d = (_m != null && 'default' in Object(_m)) ? _m.default : _m; if (typeof _d !== 'function' && _d != null && typeof _d.default !== 'undefined') _d = _d.default; module.exports = Object.assign({}, (typeof _m === 'object' && _m !== null) ? _m : {}, {default: _d, __esModule: true});\`,
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    extensionType: 'homepage',
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    requiresRestart: meta.requiresRestart ?? false,
    requiresExtension: meta.requiresExtension ?? [],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

console.log(\`Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.\`)
console.log(\`Package URL: https://registry.npmjs.org/\${meta.name}/-/\${meta.name.split('/').pop()}-\${meta.version}.tgz\`)
`)

// ─── watch.mjs ─────────────────────────────────────────────────────────────────

write('watch.mjs', `import esbuild from 'esbuild'

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            'recharts': 'window.__kwirth__.recharts',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(\`^\${pkg.replace(/[.*+?^\$\{\}()|[\\\\]\\\\]/g, '\\\\$&')}$\`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`const _m = \${globals[args.path]}; let _d = (_m != null && 'default' in Object(_m)) ? _m.default : _m; if (typeof _d !== 'function' && _d != null && typeof _d.default !== 'undefined') _d = _d.default; module.exports = Object.assign({}, (typeof _m === 'object' && _m !== null) ? _m : {}, {default: _d, __esModule: true});\`,
            loader: 'js',
        }))
    },
}

const ctx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})

await ctx.watch()
console.log('Watching src/front/ for changes...')
`)

// ─── src/front/index.ts ────────────────────────────────────────────────────────

write('src/front/index.ts', `import { ${className} } from './${className}'

;(window as any).__kwirth_homepages__['${id}'] = {
    homepageId: '${id}',
    displayName: '${displayName}',
    Component: ${className}
}
`)

// ─── src/front/{ClassName}.tsx ─────────────────────────────────────────────────

write(`src/front/${className}.tsx`, `import React from 'react'
import { Box, Typography } from '@mui/material'
import { IHomepageProps } from '@kwirthmagnify/kwirth-common-front'

const ${className}: React.FC<IHomepageProps> = (props) => {
    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h5">${displayName}</Typography>
            {props.clusters.map(cluster => (
                <Box key={cluster.name} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="body1">{cluster.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{cluster.url}</Typography>
                </Box>
            ))}
            {props.clusters.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    No clusters defined. Add a cluster to get started.
                </Typography>
            )}
        </Box>
    )
}

export { ${className} }
`)

// ─── done ──────────────────────────────────────────────────────────────────────

console.log(`
✓ Homepage scaffolded at homepages/${id}/

Next steps:
  cd homepages/${id}
  npm install
  # Implement your homepage in src/front/${className}.tsx
  npm run build        # one-shot build
  npm run watch        # dev mode (hot-reload)
  cd dist
  npm publish --access=public   # publish to npmjs
`)

// ─── helpers ───────────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(homepageDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
