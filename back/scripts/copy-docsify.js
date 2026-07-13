// Copies docsify static assets from node_modules to ./docsify/ (flat dir served by Express).
// Run automatically via prestart/prebuild npm scripts.
const { cpSync, mkdirSync, existsSync } = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const destDir = path.join(root, 'docsify')
mkdirSync(destDir, { recursive: true })

const copies = [
    ['docsify/lib/docsify.min.js', 'docsify.min.js'],
    ['docsify/lib/themes/vue.css', 'vue.css'],
    ['docsify/lib/plugins/search.min.js', 'search.min.js'],
    ['docsify-sidebar-collapse/dist/docsify-sidebar-collapse.min.js', 'docsify-sidebar-collapse.min.js'],
    ['docsify-sidebar-collapse/dist/sidebar.min.css', 'docsify-sidebar-collapse.min.css'],
    ['docsify-copy-code/dist/docsify-copy-code.min.js', 'docsify-copy-code.min.js'],
]

let ok = 0
for (const [src, dest] of copies) {
    const srcPath = path.join(root, 'node_modules', src)
    const destPath = path.join(destDir, dest)
    if (existsSync(srcPath)) {
        cpSync(srcPath, destPath)
        console.log(`  copied ${src} → docsify/${dest}`)
        ok++
    }
    else {
        console.warn(`  WARNING: ${srcPath} not found — run npm install first`)
    }
}
console.log(`Docsify assets: ${ok}/${copies.length} copied to ${destDir}`)
