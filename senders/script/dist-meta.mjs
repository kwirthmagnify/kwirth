import fs from 'fs'
import path from 'path'

// The manifest Kwirth reads from dist/. build.mjs and watch.mjs BOTH call this, so the package loaded in dev
// is exactly the one that gets published.
export const writeDistMeta = () => {
    const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    const distMeta = {
        type: 'commonjs',
        extensionType: 'sender',
        id: meta.id,
        name: meta.name,
        displayName: meta.displayName,
        version: meta.version,
        description: meta.description,
        ...(meta.website ? { website: meta.website } : {}),
        requiresRestart: meta.requiresRestart ?? false,
        requiresExtension: meta.requiresExtension ?? [],
    }
    fs.mkdirSync('dist', { recursive: true })
    fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
    return meta
}
