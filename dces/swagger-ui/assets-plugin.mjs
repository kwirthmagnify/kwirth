import fs from 'fs'
import path from 'path'

/*
    The virtual module 'swagger-ui-assets': Swagger UI's script and stylesheet, read from swagger-ui-dist when the
    bundle is built and written into it as strings. The core loads a DCE's back.js from a ConfigMap, where there is
    no node_modules to read them from at run time. Used by build.mjs, watch.mjs and tests/run.mjs.
*/
const DIST = path.resolve('node_modules', 'swagger-ui-dist')

export const swaggerUiAssetsPlugin = {
    name: 'swagger-ui-assets',
    setup(build) {
        build.onResolve({ filter: /^swagger-ui-assets$/ }, (args) => ({ path: args.path, namespace: 'swagger-ui-assets' }))
        build.onLoad({ filter: /.*/, namespace: 'swagger-ui-assets' }, () => {
            const read = (file) => fs.readFileSync(path.join(DIST, file), 'utf-8')
            const version = JSON.parse(read('package.json')).version
            return {
                contents: [
                    `export const bundleJs = ${JSON.stringify(read('swagger-ui-bundle.js'))}`,
                    `export const css = ${JSON.stringify(read('swagger-ui.css'))}`,
                    `export const version = ${JSON.stringify(version)}`
                ].join('\n'),
                loader: 'js'
            }
        })
    }
}
