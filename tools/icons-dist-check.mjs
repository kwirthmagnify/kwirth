/*
    Comprueba que ningun plugin YA CONSTRUIDO pida un icono que no esta en el barrel.

    Por que hace falta: el build de cada extension mapea '@mui/icons-material' y el barrel de kwirth a
    window.__kwirth__.MUI.icons, asi que el dist NO lleva los iconos dentro: los pide POR NOMBRE en
    runtime. Si se retira uno del barrel, ese plugin revienta con "Element type is invalid ... got
    undefined" y no hay tsc que lo avise, porque el dist es de antes.

    Como se detecta: en el bundle un icono aparece como acceso a propiedad del modulo de iconos
    (`He.ZoomIn`), asi que se buscan los `.Nombre` que ademas EXISTEN como icono de MUI. Exigir el
    punto es lo que evita el falso positivo de `title: "Clear"`, que es texto, no icono.

    Uso:  node tools/icons-dist-check.mjs      (salida 1 si hay alguno pendiente de rebuild)
*/
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const barrel = new Set([...readFileSync(join(root, 'common-front/src/kwirthicons.ts'), 'utf8')
    .matchAll(/export \{ default as (\w+) \}/g)].map(m => m[1]))
const MUI = join(root, 'front/node_modules/@mui/icons-material')

const walk = (d, o = []) => {
    let es
    try { es = readdirSync(d) } catch { return o }
    for (const e of es) {
        if (e === 'node_modules' || e === '.git') continue
        const p = join(d, e)
        let s
        try { s = statSync(p) } catch { continue }
        if (s.isDirectory()) walk(p, o)
        else if (/[\\/]dist[\\/]front\.js$/.test(p)) o.push(p)
    }
    return o
}

let files = []
for (const b of ['plugins', 'providers', 'senders', 'homepages', 'idps', 'webhooks', 'logins']) {
    files = files.concat(walk(join(root, b)))
}

/*
    El listado se lee UNA vez y se compara exacto. Con existsSync no vale: el sistema de ficheros de
    Windows no distingue mayusculas, asi que 'Checkbox' (el componente de MUI) casaba con CheckBox.js
    y 'START' (un valor de enum) con Start.js — 25 falsos positivos.
*/
const iconosMui = new Set(readdirSync(MUI).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)))

/*
    Y fuera los que son COMPONENTES de @mui/material: en el bundle, `material.Tab` es indistinguible
    de `icons.Tab` mirando solo el punto, y hay nombres que son las dos cosas (Tab, Radio, Badge,
    Checkbox). Se prefiere callarlos a dar la alarma en falso; si alguno se usa ademas como icono, lo
    cazara el uso real en cuanto reviente en pantalla.
*/
const componentesMui = new Set(readdirSync(join(root, 'front/node_modules/@mui/material'), { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name))
const iconoDeMui = (n) => iconosMui.has(n) && !componentesMui.has(n)

let malos = 0
for (const f of files) {
    const t = readFileSync(f, 'utf8')
    const pedidos = new Set([...t.matchAll(/\.([A-Z][A-Za-z0-9]+)\b/g)].map(m => m[1]))
    const faltan = [...pedidos].filter(n => !barrel.has(n) && iconoDeMui(n)).sort()
    if (faltan.length) {
        console.log(`REBUILD ${relative(root, f).replace(/\\/g, '/')} -> ${faltan.join(', ')}`)
        malos++
    }
}
console.log(malos ? `${malos} extensiones piden iconos que ya no estan en el barrel` : `${files.length} fronts construidos, ninguno pide un icono ausente`)
process.exit(malos ? 1 : 0)
