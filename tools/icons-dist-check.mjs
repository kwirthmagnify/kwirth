/*
    Checks that no ALREADY BUILT plugin asks for an icon that is not in the barrel.

    Why it is needed: every extension's build maps '@mui/icons-material' and kwirth's barrel to
    window.__kwirth__.MUI.icons, so the dist does NOT carry the icons inside: it asks for them BY NAME at
    runtime. If one is removed from the barrel, that plugin blows up with "Element type is invalid ... got
    undefined" and there is no tsc to warn about it, because the dist is from before.

    How it is detected: in the bundle an icon appears as a property access on the icons module
    (`He.ZoomIn`), so the `.Name`s that ALSO EXIST as a MUI icon are looked for. Demanding the dot is what
    avoids the false positive of `title: "Clear"`, which is text, not an icon.

    Usage:  node tools/icons-dist-check.mjs      (exit 1 when any is pending a rebuild)
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
    The listing is read ONCE and compared exactly. existsSync will not do: Windows's file system is not
    case sensitive, so 'Checkbox' (MUI's component) matched CheckBox.js and 'START' (an enum value)
    matched Start.js — 25 false positives.
*/
const iconosMui = new Set(readdirSync(MUI).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)))

/*
    And out go those that are @mui/material COMPONENTS: in the bundle, `material.Tab` is
    indistinguishable from `icons.Tab` looking at the dot alone, and there are names that are both things
    (Tab, Radio, Badge, Checkbox). Keeping quiet about them is preferred to raising a false alarm; should
    one of them also be used as an icon, real use will catch it as soon as it blows up on screen.
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
