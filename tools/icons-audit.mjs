/*
    Auditoria del barrel de iconos (common-front/src/kwirthicons.ts): que iconos hay y donde se usan.

    Se barre TODO el working copy, repos privados incluidos, porque los de pago viven dentro (gitignorados
    pero presentes) y tambien consumen el barrel.

    Hay CUATRO formas de consumir un icono, y solo la primera se ve leyendo imports:

      1. import { X } from '@kwirthmagnify/kwirth-common-front/icons'  — lo normal en front y extensiones
      2. import { X } from './kwirthicons'                             — DENTRO de common-front, ruta relativa
      3. import { X } from '@mui/icons-material'                       — sin pasar por el barrel
      4. "icon": "X" / icon: 'X'                                       — POR NOMBRE, en un manifest o en codigo;
         se resuelve en runtime contra window.__kwirth__.MUI.icons, asi que el icono tiene que seguir en el
         barrel aunque nadie lo importe

    Las vias 2 y 4 son las que producen falsos "sin usar" si se olvidan.

    Uso:  node tools/icons-audit.mjs   -> reescribe plans/icons/ICONS-AUDIT.md
*/
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, extname, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const icons = [...readFileSync(join(root, 'common-front/src/kwirthicons.ts'), 'utf8')
    .matchAll(/export \{ default as (\w+) \}/g)].map(m => m[1])

// 'bundle', 'target' y back/front son COPIAS DEL FRONT COMPILADO: llevan el barrel entero dentro,
// asi que barrerlas da positivo en los 149 nombres. Es ruido, no uso.
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

// Orden alfabetico, y sin depender de como esten escritos los exports en el barrel
const filas = icons.map(i => ({
    icono: i,
    code: [...uso.get(i).code].sort(),
    byName: [...uso.get(i).byName].sort()
})).sort((a, b) => a.icono.localeCompare(b.icono))
const sinUso = filas.filter(f => !f.code.length && !f.byName.length)
const soloNombre = filas.filter(f => !f.code.length && f.byName.length)

/*
    El dibujo del icono, sacado del propio paquete de MUI: cada modulo lleva su path en `d: "..."`.
    Se emite SVG en linea para poder VER el icono al lado del nombre — se ve en el preview de markdown
    de VS Code; GitHub sanea el svg y ahi solo quedaria el nombre.
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
mkdirSync(join(root, 'plans/icons'), { recursive: true })
writeFileSync(join(root, 'plans/icons/ICONS-AUDIT.md'), md)

console.log(`${icons.length} iconos, ${files.length} ficheros`)
console.log(`por import : ${filas.filter(f => f.code.length).length}`)
console.log(`solo por nombre: ${soloNombre.length}  -> ${soloNombre.map(f => f.icono).join(', ') || '-'}`)
console.log(`sin uso    : ${sinUso.length}  -> ${sinUso.map(f => f.icono).join(', ') || '-'}`)
const deep = filas.filter(f => f.code.some(c => c.endsWith('(deep)')))
console.log(`deep imports: ${deep.map(f => f.icono).join(', ') || 'ninguno'}`)
