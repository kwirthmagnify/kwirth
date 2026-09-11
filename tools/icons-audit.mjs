// Barrido profundo: para CADA icono del barrel, en que ficheros fuente se usa.
//
// Tres formas de consumo, y las tres cuentan:
//   1. import { X } desde el barrel de kwirth  -> uso estatico del monorepo
//   2. import { X } desde '@mui/icons-material' -> lo mismo, pero sin pasar por el barrel
//   3. "icon": "X" en un manifest/package.json -> se resuelve POR NOMBRE en runtime contra el global
//      window.__kwirth__.MUI.icons, asi que el icono tiene que seguir en el barrel aunque nadie lo importe
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, extname, relative } from 'path'

const root = 'C:/github/aisdkvercel/kwirth'
const icons = [...readFileSync(`${root}/common-front/src/kwirthicons.ts`, 'utf8')
    .matchAll(/export \{ default as (\w+) \}/g)].map(m => m[1])

const walk = (dir, out = []) => {
    let entries
    try { entries = readdirSync(dir) } catch { return out }
    for (const e of entries) {
        if (['node_modules', '.git', 'dist', 'build', 'test-results', '.cache'].includes(e)) continue
        const p = join(dir, e)
        let st
        try { st = statSync(p) } catch { continue }
        if (st.isDirectory()) walk(p, out)
        else if (['.ts', '.tsx', '.json'].includes(extname(e))) out.push(p)
    }
    return out
}

const files = walk(root).filter(f => !f.includes('kwirthicons'))
const uso = new Map(icons.map(i => [i, { code: new Set(), manifest: new Set() }]))

for (const f of files) {
    let t
    try { t = readFileSync(f, 'utf8') } catch { continue }
    const rel = relative(root, f).replace(/\\/g, '/')

    if (f.endsWith('.json')) {
        for (const m of t.matchAll(/"icon"\s*:\s*"(\w+)"/g)) uso.get(m[1])?.manifest.add(rel)
        continue
    }
    // nombres importados de un barrel de iconos (kwirth o @mui), con o sin alias
    const listas = [...t.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(?:@kwirthmagnify\/kwirth-common-front\/icons|@mui\/icons-material)'/g)]
    const importados = new Set()
    for (const l of listas) {
        for (const trozo of l[1].split(',')) {
            const nombre = trozo.trim().split(/\s+as\s+/)[0].trim()
            if (nombre) importados.add(nombre)
        }
    }
    for (const i of importados) if (uso.has(i)) uso.get(i).code.add(rel)
    // deep imports, que deberian estar prohibidos fuera de common-front
    for (const m of t.matchAll(/from '@mui\/icons-material\/(\w+)'/g)) if (uso.has(m[1])) uso.get(m[1]).code.add(rel + ' (deep)')
}

const filas = icons.map(i => ({ icono: i, code: [...uso.get(i).code].sort(), manifest: [...uso.get(i).manifest].sort() }))
const sinUso = filas.filter(f => f.code.length === 0 && f.manifest.length === 0)

let md = `# Iconos del barrel kwirthicons\n\n${icons.length} iconos. Generado por barrido de ${files.length} ficheros del working copy (incluye los repos privados).\n\n`
md += `- Con uso en codigo: ${filas.filter(f => f.code.length).length}\n`
md += `- Solo pedidos por nombre desde un manifest: ${filas.filter(f => !f.code.length && f.manifest.length).length}\n`
md += `- Sin ningun uso: ${sinUso.length}\n\n`
md += `| Icono | Ficheros que lo usan | Manifests que lo piden por nombre |\n|---|---|---|\n`
for (const f of filas) {
    md += `| \`${f.icono}\` | ${f.code.length ? f.code.join('<br>') : '—'} | ${f.manifest.length ? f.manifest.join('<br>') : '—'} |\n`
}
writeFileSync(`${root}/plans/icons/ICONS-AUDIT.md`, md)

console.log(`${icons.length} iconos, ${files.length} ficheros barridos`)
console.log(`con uso en codigo: ${filas.filter(f => f.code.length).length}`)
console.log(`solo por nombre en manifest: ${filas.filter(f => !f.code.length && f.manifest.length).length}`)
console.log(`SIN NINGUN USO (${sinUso.length}): ${sinUso.map(f => f.icono).join(', ')}`)
const deep = filas.filter(f => f.code.some(c => c.endsWith('(deep)')))
console.log(`deep imports vivos: ${deep.length ? deep.map(f => f.icono + ' ' + f.code.filter(c => c.endsWith('(deep)')).join()).join(' | ') : 'ninguno'}`)
