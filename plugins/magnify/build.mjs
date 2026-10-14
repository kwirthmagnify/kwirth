import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import { frontOptions, backOptions, writeDistMeta } from './esbuild.options.mjs'

// esbuild erases the types without looking at them: without this step the build would pass broken TS.
// watch.mjs deliberately leaves it out, so that saving stays instantaneous.
const TSC = 'node_modules/typescript/lib/tsc.js'
if (fs.existsSync(TSC)) {
    try {
        execFileSync(process.execPath, [TSC, '--noEmit'], { stdio: 'inherit' })
        console.log('Typecheck passed')
    }
    catch {
        console.error('Typecheck failed — build aborted')
        process.exit(1)
    }
}
else {
    console.log('Skipping typecheck: typescript is not installed (run npm install)')
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build(frontOptions)
console.log('Built dist/front.js')

await esbuild.build(backOptions)
console.log('Built dist/back.js')

const meta = writeDistMeta()
console.log('Wrote dist/package.json and copied README.md to dist/')

const npmName = `@kwirthmagnify/kwirth-plugin-${meta.id}`
console.log("Done. Run 'npm publish --access=public' on your 'dist' folder in order to publish your package to npmjs.")
console.log(`Package will be accessible (and installable on Kwirth) via this URL: https://registry.npmjs.org/${npmName}/-/kwirth-plugin-${meta.id}-${meta.version}.tgz`)
