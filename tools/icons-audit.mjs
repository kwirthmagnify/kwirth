/*
    Audit of the icons barrel (common-front/src/kwirthicons.ts): which icons there are and where they are used.

    The WHOLE working copy is swept, private repos included, because the paid ones live inside (gitignored
    but present) and they consume the barrel too.

    There are FOUR ways of consuming an icon, and only the first shows up when reading imports:

      1. import { X } from '@kwirthmagnify/kwirth-common-front/icons'  — the usual one in the front end and extensions
      2. import { X } from './kwirthicons'                             — INSIDE common-front, a relative path
      3. import { X } from '@mui/icons-material'                       — without going through the barrel
      4. "icon": "X" / icon: 'X'                                       — BY NAME, in a manifest or in code;
         it is resolved at runtime against window.__kwirth__.MUI.icons, so the icon has to stay in the
         barrel even though nobody imports it

    Routes 2 and 4 are the ones that produce false "unused" when forgotten.

    Usage:  node tools/icons-audit.mjs   -> rewrites plans/icons/ICONS-AUDIT.md
*/
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, extname, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const icons = [...readFileSync(join(root, 'common-front/src/kwirthicons.ts'), 'utf8')
    .matchAll(/export \{ default as (\w+) \}/g)].map(m => m[1])

// 'bundle', 'target' and back/front are COPIES OF THE COMPILED FRONT END: they carry the whole barrel
// inside, so sweeping them hits all 149 names. That is noise, not use.
const SKIP = ['node_modules', '.git', 'dist', 'build', 'bundle', 'target', 'resources', 'test-results', '.cache']

const walk = (dir, out = []) => {
    let entries
    try { entries = readdirSync(dir) } catch { return out }
    for (const e of entries) {
        if (SKIP.includes(e)) continue
        const p = join(dir, e)
        let st
        try { st = statSync(p) } catch { continue }
        if (st.isDirectory()) walk(p, out)
        else if (['.ts', '.tsx', '.json'].includes(extname(e))) out.push(p)
    }
    return out
}

const IMPORT_BARREL = /import\s*\{([^}]*)\}\s*from\s*'(?:@kwirthmagnify\/kwirth-common-front\/icons|@mui\/icons-material|[.\/]*kwirthicons)'/g
const IMPORT_DEEP = /from '@mui\/icons-material\/(\w+)'/g
const NAME_IN_JSON = /"icon"\s*:\s*"(\w+)"/g
const NAME_IN_CODE = /[{,;\s]icon\s*:\s*'(\w+)'/g

const files = walk(root).filter(f => !f.includes('kwirthicons') && !f.includes('icons-audit') && !f.includes('ICONS-AUDIT'))
const uso = new Map(icons.map(i => [i, { code: new Set(), byName: new Set() }]))

for (const f of files) {
    let t
    try { t = readFileSync(f, 'utf8') } catch { continue }
    const rel = relative(root, f).replace(/\\/g, '/')

    if (f.endsWith('.json')) {
        for (const m of t.matchAll(NAME_IN_JSON)) uso.get(m[1])?.byName.add(rel)
        continue
    }
    for (const m of t.matchAll(NAME_IN_CODE)) uso.get(m[1])?.byName.add(rel)
    for (const m of t.matchAll(IMPORT_DEEP)) uso.get(m[1])?.code.add(rel + ' (deep)')
    for (const lista of t.matchAll(IMPORT_BARREL)) {
        for (const trozo of lista[1].split(',')) {
            const nombre = trozo.trim().split(/\s+as\s+/)[0].trim()
            if (nombre && uso.has(nombre)) uso.get(nombre).code.add(rel)
        }
    }
}

// Alphabetical order, and without depending on how the exports are written in the barrel
const filas = icons.map(i => ({
    icono: i,
    code: [...uso.get(i).code].sort(),
    byName: [...uso.get(i).byName].sort()
})).sort((a, b) => a.icono.localeCompare(b.icono))
const sinUso = filas.filter(f => !f.code.length && !f.byName.length)
const soloNombre = filas.filter(f => !f.code.length && f.byName.length)

/*
    The icon's drawing, taken from MUI's own package: every module carries its path in `d: "..."`.
    Inline SVG is emitted so the icon can be SEEN next to the name — it shows in VS Code's markdown
    preview; GitHub sanitises the svg and there only the name would be left.
*/
const MUI = join(root, 'front/node_modules/@mui/icons-material')
const dibujo = (nombre) => {
    let mod
    try { mod = readFileSync(join(MUI, `${nombre}.js`), 'utf8') } catch { return '' }
    const paths = [...mod.matchAll(/d:\s*"([^"]+)"/g)].map(m => m[1])
    if (!paths.length) return ''
    const cuerpo = paths.map(d => `<path d="${d}"/>`).join('')
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${cuerpo}</svg>`
}

let md = `# Iconos del barrel kwirthicons\n\n`
md += `${icons.length} iconos, cruzados contra ${files.length} ficheros del working copy (repos privados incluidos).\n`
md += `Regenerar con \`node tools/icons-audit.mjs\`.\n\n`
md += `Se cuentan las cuatro formas de consumir un icono: import del barrel de kwirth (por paquete o relativo\n`
md += `dentro de common-front), import de @mui, y cita **por nombre** (\`"icon": "X"\` en un manifest o\n`
md += `\`icon: 'X'\` en codigo), que se resuelve en runtime contra \`window.__kwirth__.MUI.icons\`.\n\n`
md += `- Usados por import: **${filas.filter(f => f.code.length).length}**\n`
md += `- Solo citados por nombre: **${soloNombre.length}**${soloNombre.length ? ` (${soloNombre.map(f => f.icono).join(', ')})` : ''}\n`
md += `- Sin ningun uso: **${sinUso.length}**${sinUso.length ? ` (${sinUso.map(f => f.icono).join(', ')})` : ''}\n\n`
md += `El dibujo se ve en el preview de markdown de VS Code; GitHub sanea el SVG y deja solo el nombre.\n\n`
md += `| | Icono | Ficheros que lo importan | Citado por nombre en |\n|---|---|---|---|\n`
for (const f of filas) {
    md += `| ${dibujo(f.icono)} | \`${f.icono}\` | ${f.code.length ? f.code.join('<br>') : '—'} | ${f.byName.length ? f.byName.join('<br>') : '—'} |\n`
}
/*
    Second table: the inverse view, by PROJECT. The first answers "who uses this icon"; this one answers
    "which icons does this plugin use", which is what is needed when a project is touched or when one
    wants to know who is affected by removing something.

    The project is the artefact's root directory: plugins/censor, senders/tee, front, common-front…
*/
const proyectoDe = (rel) => {
    const p = rel.split('/')
    if (['plugins', 'providers', 'senders', 'homepages', 'idps', 'webhooks', 'logins'].includes(p[0]) && p[1]) return `${p[0]}/${p[1]}`
    return p[0]
}

const porProyecto = new Map()
for (const f of filas) {
    for (const ref of [...f.code, ...f.byName]) {
        const proyecto = proyectoDe(ref.replace(' (deep)', ''))
        if (!porProyecto.has(proyecto)) porProyecto.set(proyecto, new Set())
        porProyecto.get(proyecto).add(f.icono)
    }
}

md += `\n## Por proyecto\n\n`
md += `La vista inversa: que iconos usa cada artefacto. Util para saber a quien afecta retirar uno, y\n`
md += `para revisar la coherencia dentro de un mismo proyecto.\n\n`
md += `| Proyecto | Iconos | Total |\n|---|---|---|\n`
for (const proyecto of [...porProyecto.keys()].sort()) {
    const lista = [...porProyecto.get(proyecto)].sort()
    md += `| \`${proyecto}\` | ${lista.map(i => `${dibujo(i)} ${i}`).join(' · ')} | ${lista.length} |\n`
}

mkdirSync(join(root, 'plans/icons'), { recursive: true })
writeFileSync(join(root, 'plans/icons/ICONS-AUDIT.md'), md)

console.log(`${icons.length} iconos, ${files.length} ficheros`)
console.log(`por import : ${filas.filter(f => f.code.length).length}`)
console.log(`solo por nombre: ${soloNombre.length}  -> ${soloNombre.map(f => f.icono).join(', ') || '-'}`)
console.log(`sin uso    : ${sinUso.length}  -> ${sinUso.map(f => f.icono).join(', ') || '-'}`)
const deep = filas.filter(f => f.code.some(c => c.endsWith('(deep)')))
console.log(`deep imports: ${deep.map(f => f.icono).join(', ') || 'ninguno'}`)
