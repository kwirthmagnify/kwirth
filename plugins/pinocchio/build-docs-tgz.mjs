// Generates docs/pinocchio.tgz from docs/guide/ for kwirth's docs marketplace (extensionType: docs).
// It runs on import alone, so build.mjs can do `await import('./build-docs-tgz.mjs')` and watch.mjs can
// relaunch it as a child process on every change to the guide.
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { create as tarCreate } from 'tar'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = createRequire(import.meta.url)('./package.json')

const guideDir = join(__dirname, 'docs', 'guide')
const outTgz = join(__dirname, 'docs', 'pinocchio.tgz')

if (!existsSync(guideDir)) {
    console.error('docs/guide/ not found')
    process.exit(1)
}

const tmpDir = join(tmpdir(), `kwirth-docs-pinocchio-${Date.now()}`)
mkdirSync(tmpDir, { recursive: true })
try {
    cpSync(guideDir, tmpDir, { recursive: true })

    // The core serves docsify offline (its own bundle): it rewrites the CDN URLs to local paths.
    const htmlPath = join(tmpDir, 'index.html')
    if (existsSync(htmlPath)) {
        let html = readFileSync(htmlPath, 'utf-8')
        html = html
            .replace(/\/\/cdn\.jsdelivr\.net\/npm\/docsify@4\/lib\/themes\/vue\.css/g, '../../docsify/vue.css')
            .replace(/\/\/cdn\.jsdelivr\.net\/npm\/docsify@4[^"']*/g, '../../docsify/docsify.min.js')
            .replace(/\/\/cdn\.jsdelivr\.net\/npm\/docsify\/lib\/plugins\/search\.min\.js/g, '../../docsify/search.min.js')
            .replace(/\/\/cdn\.jsdelivr\.net\/npm\/docsify-copy-code[^"']*/g, '../../docsify/docsify-copy-code.min.js')
            .replace(/\/\/cdn\.jsdelivr\.net\/npm\/docsify-sidebar-collapse[^"']*/g, '../../docsify/docsify-sidebar-collapse.min.js')
            .replace(/relativePath\s*:\s*true/g, 'relativePath: false')
        writeFileSync(htmlPath, html)
    }

    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        extensionType: 'docs',
        targetType: 'plugin',
        id: 'pinocchio',
        name: '@kwirthmagnify/kwirth-docs-pinocchio',
        displayName: 'Kwirth Pinocchio — Guide',
        version: pkg.version,
        description: 'User and administrator guide for the Kwirth Pinocchio plugin'
    }, null, 2))

    // The 'package/' prefix is NOT decorative: npmjs rejects the tarball without it, with
    // "415 Unsupported Media Type - invalid path: ./". Kwirth accepts both shapes on install — it looks
    // for package.json at the root and under package/ — so this breaks nothing and makes the tgz publishable.
    await tarCreate({ gzip: true, file: outTgz, cwd: tmpDir, prefix: 'package' }, ['.'])
    console.log(`pinocchio docs tgz: ${outTgz} (v${pkg.version})`)
}
finally {
    rmSync(tmpDir, { recursive: true, force: true })
}
