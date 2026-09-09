// Genera docs/pinocchio.tgz desde docs/guide/ para el marketplace de docs de kwirth (extensionType: docs).
// Se ejecuta solo al importarlo, asi que build.mjs puede hacer `await import('./build-docs-tgz.mjs')`
// y watch.mjs puede relanzarlo como proceso hijo en cada cambio de la guia.
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

    // El core sirve docsify offline (bundle propio): reescribe las URLs de CDN a rutas locales.
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
        displayName: 'kwirth Pinocchio — Guide',
        version: pkg.version,
        description: 'User and administrator guide for the kwirth Pinocchio plugin'
    }, null, 2))

    // El prefijo 'package/' NO es decorativo: npmjs rechaza el tarball sin el, con
    // "415 Unsupported Media Type - invalid path: ./". Kwirth acepta las dos formas al instalar —busca
    // package.json en la raiz y bajo package/—, asi que esto no rompe nada y ademas hace el tgz publicable.
    await tarCreate({ gzip: true, file: outTgz, cwd: tmpDir, prefix: 'package' }, ['.'])
    console.log(`pinocchio docs tgz: ${outTgz} (v${pkg.version})`)
}
finally {
    rmSync(tmpDir, { recursive: true, force: true })
}
