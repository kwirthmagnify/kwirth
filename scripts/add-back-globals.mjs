import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'

// The back globals plugin to inject (uses simple regex, no complex escaping needed)
const backPluginDef = [
'',
'const kwirthBackGlobalsPlugin = {',
"    name: 'kwirth-back-globals',",
'    setup(build) {',
'        const backGlobals = {',
"            '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',",
"            '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',",
'        }',
"        build.onResolve({ filter: /^@kwirthmagnify\\/kwirth-common(-back)?$/ }, (args) => {",
"            if (backGlobals[args.path]) return { path: args.path, namespace: 'kwirth-back-globals' }",
'        })',
"        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({",
"            contents: 'module.exports = ' + backGlobals[args.path],",
"            loader: 'js',",
'        }))',
'    },',
'}',
''
].join('\n')

const pluginsDir = 'c:\\github\\aisdkvercel\\kwirth\\plugins'
const plugins = readdirSync(pluginsDir).filter(d => statSync(join(pluginsDir, d)).isDirectory())

let count = 0
for (const plugin of plugins) {
    for (const file of ['build.mjs', 'watch.mjs']) {
        const filePath = join(pluginsDir, plugin, file)
        try {
            let content = readFileSync(filePath, 'utf-8')
            let changed = false

            // 1. Insert back plugin definition before fs.mkdirSync
            if (!content.includes('kwirth-back-globals')) {
                const marker = '}\n\nfs.mkdirSync'
                if (content.includes(marker)) {
                    content = content.replace(marker, '}\n' + backPluginDef + '\nfs.mkdirSync')
                    changed = true
                }
            }

            // 2. Add plugins array to back esbuild build (find the back build section)
            if (content.includes('kwirthBackGlobalsPlugin') && !content.includes('plugins: [kwirthBackGlobalsPlugin]')) {
                // Match external line in back build (always has '.ts': 'ts')
                const patterns = [
                    ["    external: ['express', '@kwirthmagnify/kwirth-common-back'],\n    loader: { '.ts': 'ts',",
                     "    plugins: [kwirthBackGlobalsPlugin],\n    external: ['express', '@kwirthmagnify/kwirth-common-back'],\n    loader: { '.ts': 'ts',"],
                    ["    external: ['express'],\n    loader: { '.ts': 'ts' },",
                     "    plugins: [kwirthBackGlobalsPlugin],\n    external: ['express'],\n    loader: { '.ts': 'ts' },"],
                ]
                for (const [old, replacement] of patterns) {
                    if (content.includes(old)) {
                        content = content.replace(old, replacement)
                        changed = true
                        break
                    }
                }
            }

            if (changed) {
                writeFileSync(filePath, content, 'utf-8')
                console.log(`Updated: ${plugin}/${file}`)
                count++
            }
        } catch (e) {
            console.error(`Error in ${plugin}/${file}:`, e.message)
        }
    }
}
console.log(`\nTotal: ${count} files updated`)
