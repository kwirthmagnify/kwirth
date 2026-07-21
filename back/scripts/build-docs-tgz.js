// Builds the kwirth documentation extension tgz for bundling with the back.
// Reads from docs/<version>/ (read-only) and outputs to bundle/docs/kwirth.tgz.
// Content is flattened to tgz root so docsify basePath './' works correctly.
// Run automatically via prestart and postbuild npm scripts.
const { cpSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, rmSync } = require('fs')
const path = require('path')
const tar = require('tar')
const os = require('os')

const repoRoot = path.resolve(__dirname, '..', '..')
const bundleDocsDir = path.resolve(__dirname, '..', 'bundle', 'docs')

function findLatestDocsVersion() {
    const docsRoot = path.join(repoRoot, 'docs')
    const dirs = readdirSync(docsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            for (let i = 0; i < 3; i++) {
                if (pa[i] !== pb[i]) return pb[i] - pa[i]
            }
            return 0
        })
    if (dirs.length === 0) throw new Error('No versioned docs directory found in docs/')
    return dirs[0]
}

async function main() {
    const version = findLatestDocsVersion()
    const docsSourceDir = path.join(repoRoot, 'docs', version)
    const darkCssPath = path.join(repoRoot, 'docs', 'documentation', 'kwirth-dark.css')

    console.log(`Building kwirth docs tgz from docs/${version}/ (flattened)`)

    const darkCss = existsSync(darkCssPath) ? readFileSync(darkCssPath, 'utf-8') : ''

    // Flatten sidebar: remove version prefix from all links so they resolve from basePath './'
    const sidebarSrc = path.join(docsSourceDir, '_sidebar.md')
    let sidebarContent = existsSync(sidebarSrc) ? readFileSync(sidebarSrc, 'utf-8') : ''
    // Remove the version-selector <center> block (multi-line)
    sidebarContent = sidebarContent.replace(/<center>[\s\S]*?<\/center>\s*/m, '')
    // Replace /version/ prefix in links: (/0.5.287/foo) → (/foo)
    sidebarContent = sidebarContent.replace(new RegExp(`/${version}/`, 'g'), '/')

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kwirth Documentation</title>
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
  <meta name="description" content="Kwirth documentation — Kubernetes observability platform">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0">
  <link rel="stylesheet" href="../../docsify/vue.css">
  <link rel="stylesheet" href="../../docsify/docsify-sidebar-collapse.min.css">
  <style>
    .markdown-section h2 { margin-bottom: -10px }
    .markdown-section h3 { margin-bottom: -10px }
    h5 { margin-bottom: -15px }
    .imageclass100 { display: block; margin: 0 auto; border-style: solid; border-width: 1px; margin-top: 12px; margin-bottom: 4px; }
    .imageclass90  { display: block; width: 90%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclass80  { display: block; width: 80%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclass60  { display: block; width: 60%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclass40  { display: block; width: 40%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclass20  { display: block; width: 20%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclass10  { display: block; width: 10%; margin: 0 auto; border-style: solid; border-width: 1px }
    .imageclassCenter { display: block; width: 60%; margin: 0 auto; align-self: center; border-style: solid; border-width: 1px }
${darkCss ? darkCss.split('\n').map(l => '    ' + l).join('\n') : ''}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    window.$docsify = {
      auto2top: true,
      relativePath: false,
      loadSidebar: true,
      basePath: './',
      name: 'Kwirth',
      homepage: 'index.md',
      subMaxLevel: 0,
      search: {
        maxAge: 86400000,
        paths: 'auto',
        placeholder: 'Search...',
        noData: 'No Results!',
        depth: 6,
        hideOtherSidebarContent: false
      }
    }
  </script>
  <script src="../../docsify/docsify.min.js"></script>
  <script src="../../docsify/search.min.js"></script>
  <script src="../../docsify/docsify-sidebar-collapse.min.js"></script>
  <script src="../../docsify/docsify-copy-code.min.js"></script>
</body>
</html>`

    const packageJson = JSON.stringify({
        extensionType: 'docs',
        targetType: 'core',
        id: 'kwirth',
        name: 'Kwirth Documentation',
        version,
        description: 'Official Kwirth user and administrator documentation'
    }, null, 2)

    const tmpDir = path.join(os.tmpdir(), `kwirth-docs-build-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    try {
        writeFileSync(path.join(tmpDir, 'package.json'), packageJson)
        writeFileSync(path.join(tmpDir, 'index.html'), indexHtml)
        // Flatten: copy versioned content directly to tgz root (not inside a version subdir)
        cpSync(docsSourceDir, tmpDir, { recursive: true })
        // Overwrite _sidebar.md AFTER cpSync (it would otherwise restore the original)
        writeFileSync(path.join(tmpDir, '_sidebar.md'), sidebarContent)

        mkdirSync(bundleDocsDir, { recursive: true })
        const outTgz = path.join(bundleDocsDir, 'kwirth.tgz')
        await tar.c({ gzip: true, file: outTgz, cwd: tmpDir }, ['.'])
        console.log(`  kwirth docs tgz written to ${outTgz} (v${version})`)
    }
    finally {
        rmSync(tmpDir, { recursive: true, force: true })
    }
}

main().catch(err => { console.error('build-docs-tgz failed:', err); process.exit(1) })
