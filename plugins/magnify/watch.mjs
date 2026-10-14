import esbuild from 'esbuild'
import { frontOptions, backOptions, writeDistMeta } from './esbuild.options.mjs'

// The same configuration as build.mjs (esbuild.options.mjs), without the typecheck and without minifying,
// so that saving stays instantaneous and front.js stays readable while developing.
writeDistMeta()

const frontCtx = await esbuild.context({ ...frontOptions, minify: false })
const backCtx = await esbuild.context(backOptions)

await frontCtx.watch()
await backCtx.watch()

console.log('[watch] Watching src/ — front.js and back.js rebuild on every change.')
console.log('[watch] kwirth backend hot-reloads back.js automatically.')
console.log('[watch] kwirth frontend polls for front.js changes every 2s.')
