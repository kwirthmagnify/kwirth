// Generates docs/<scope>-docs-pinocchio-<version>.tgz from docs/guide/ for kwirth's docs marketplace
// (extensionType: docs).
// It runs on import alone, so build.mjs can do `await import('./build-docs-tgz.mjs')` and watch.mjs can
// relaunch it as a child process on every change to the guide.
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { create as tarCreate } from 'tar'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = createRequire(import.meta.url)('./package.json')

const guideDir = join(__dirname, 'docs', 'guide')
const docsDir = join(__dirname, 'docs')

/*  🔴 The scope is DERIVED from the package, never typed: there are three houses and two are public, so a
    literal here is how a paid guide ends up announcing itself as OSS.

    The tarball used to be 'pinocchio.tgz' — no scope, no type and, above all, no VERSION. Previous ones
    are deleted before packing: with the version in the name they would pile up, and since the dev config
    now points at this FOLDER and takes the tgz inside, a leftover would be a guide that does not match
    the code, served without a word. */
const scope = (pkg.publisher ?? pkg.name.split('/')[0]).replace(/^@/, '')
const npmName = `@${scope}/docs-pinocchio`
const outTgz = join(docsDir, `${scope}-docs-pinocchio-${pkg.version}.tgz`)

if (!existsSync(guideDir)) {
    console.error('docs/guide/ not found')
    process.exit(1)
}

for (const f of readdirSync(docsDir)) if (f.endsWith('.tgz')) rmSync(join(docsDir, f))

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
        name: npmName,
        displayName: 'Kwirth Pinocchio — Guide',
        version: pkg.version,
        description: 'User and administrator guide for the Kwirth Pinocchio plugin'
    }, null, 2))

    // The package page on npm is this README: publishing without it left a page that said nothing.
    writeFileSync(join(tmpDir, 'README.md'), [
        '# Kwirth Pinocchio — Guide',
        '',
        `The user and administrator guide of **Pinocchio** (version ${pkg.version}), the AI channel plugin for`,
        '**[Kwirth](https://kwirthmagnify.dev)** that analyses Kubernetes events with an LLM: triggers, findings,',
        'the playground, and how to configure the AI provider and the tools it may use.',
        '',
        'It is a Kwirth **docs** extension: once installed, the help buttons of the Pinocchio channel open it inside',
        'Kwirth, served by Kwirth itself (no internet access needed).',
        '',
        '> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,',
        '> in real time, extended with plugins like Pinocchio.',
        '> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**',
        '',
        '## Installing it',
        '',
        'From Kwirth: **☰ → Manage extensions → Docs**, find **Kwirth Pinocchio — Guide** in the marketplace and',
        'install it. Install the version that matches your Pinocchio plugin: both are released together, with the',
        'same version number.',
        '',
        '## License',
        '',
        'Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.',
        ''
    ].join('\n'))

    // The 'package/' prefix is NOT decorative: npmjs rejects the tarball without it, with
    // "415 Unsupported Media Type - invalid path: ./". Kwirth accepts both shapes on install — it looks
    // for package.json at the root and under package/ — so this breaks nothing and makes the tgz publishable.
    await tarCreate({ gzip: true, file: outTgz, cwd: tmpDir, prefix: 'package' }, ['.'])
    console.log(`pinocchio docs tgz: ${outTgz} (v${pkg.version})`)
}
finally {
    rmSync(tmpDir, { recursive: true, force: true })
}
