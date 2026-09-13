// QA charts generator (CL9 point 2c) — SHARED TOOL, lives here so agents find it.
//
//   node tools/gen-coverage-chart.mjs <path to docs/qa/test-metrics-history.md> <out .png> [title]
//
// Reads a test-metrics-history.md and writes TWO PNGs next to each other, one run:
//
//   <out>.png                     coverage over time     — 3 series: lines / branches / funcs (%)
//   <out with -tests>.png         suite size over time   — 2 series: harness tests / e2e cases (count)
//
// The second path is derived from the first: 'test-metrics-coverage.png' -> 'test-metrics-tests.png'.
//
// The suite-size chart counts tests that EXIST, not tests that ran: from '13 specs · 39 casos · 38 ✅,
// 1 saltado' it takes 39, not 38. A skipped or failing test is still a test that was written.
//
// One point PER TABLE ENTRY (one per row). A chart whose rows carry no usable number is skipped with a
// warning instead of failing — not every artefact tracks coverage, and some have manual-only e2e.
//
// Playwright (Chromium) is resolved from any plugin's e2e install — no dependency of its own.
//
// Used by every CL9 close: each plugin/provider (and the core) regenerates its docs/qa PNGs.

import { readFileSync } from 'fs'
import { existsSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import url from 'url'

const here = path.dirname(url.fileURLToPath(import.meta.url))   // <repo>/tools
const repo = path.dirname(here)

// ── resolve Playwright's chromium from any plugin e2e install (the tool has no node_modules of its own) ──
let chromium
for (const e2e of ['plugins/agora/e2e', 'plugins/excubitor/e2e', 'plugins/iter/e2e', 'plugins/montag/e2e']) {
    const pkg = path.join(repo, e2e, 'node_modules/@playwright/test/package.json')
    if (existsSync(pkg)) {
        const req = createRequire(path.join(repo, e2e, 'index.js'))
        ;({ chromium } = req('@playwright/test'))
        break
    }
}
if (!chromium) {
    console.error('Playwright not found. Install e2e deps in a plugin (e.g. `cd plugins/agora/e2e && npm i`).')
    process.exit(1)
}

const [, , mdPath, pngPath, titleArg] = process.argv
if (!mdPath || !pngPath) {
    console.error('usage: node tools/gen-coverage-chart.mjs <history.md> <out.png> [title]')
    process.exit(1)
}
const title = titleArg ?? 'Test coverage over time'
// el PNG de tamaño de suite vive al lado del de cobertura y se nombra a partir de él
const testsPngPath = /coverage/i.test(path.basename(pngPath))
    ? path.join(path.dirname(pngPath), path.basename(pngPath).replace(/coverage/i, 'tests'))
    : pngPath.replace(/\.png$/i, '') + '-tests.png'
const testsTitle = title.replace(/coverage/i, 'suite size')

// ── parse the markdown table ─────────────────────────────────────────────────────────────────────────────
// Coverage is found by CONTENT (the 'L% / B% / F%' cell), which is unambiguous. Harness and e2e are found
// by HEADER, because their cells are free prose and no pattern tells them apart reliably.
const md = readFileSync(mdPath, 'utf8')
const cov = /([\d.,]+)\s*%\s*\/\s*([\d.,]+)\s*%\s*\/\s*([\d.,]+)\s*%/   // '.' or ',' decimals, optional space
const num = s => parseFloat(String(s).replace(',', '.'))

const tableLines = md.split('\n').filter(l => l.trim().startsWith('|'))
const cells = line => line.split('|').slice(1, -1).map(c => c.trim().replace(/`/g, ''))
const header = tableLines.find(l => /^\|\s*(Fecha|Date)\s*\|/i.test(l))
const headerCells = header ? cells(header) : []
const iHarness = headerCells.findIndex(c => /^harness/i.test(c))
const iE2e = headerCells.findIndex(c => /^e2e/i.test(c))

// Cuantos tests de harness EXISTEN. '**232** ✅' -> 232, '**103** (+3)' -> 103, '22/22 ✔' -> 22, 'n/a' -> nada.
const parseHarness = (cell) => {
    if (cell === undefined) return undefined
    const ratio = /^\D*(\d+)\s*\/\s*(\d+)/.exec(cell)          // 'pasados/totales': manda el total
    if (ratio) return parseInt(ratio[2], 10)
    const first = /(\d+)/.exec(cell)
    return first ? parseInt(first[1], 10) : undefined
}

// Cuantos casos e2e EXISTEN. '13 specs · 39 casos · 38 ✅, 1 saltado' -> 39 (los escritos, no los verdes);
// '2 / 5' -> 5; '8 / 12 (7 funcionales + 1 captura)' -> 12; '✔ manual (...)' -> nada.
const parseE2eCases = (cell) => {
    if (cell === undefined) return undefined
    const casos = /(\d+)\s*casos?\b/i.exec(cell)
    if (casos) return parseInt(casos[1], 10)
    const pair = /^\D*(\d+)\s*\/\s*(\d+)/.exec(cell)           // 'specs / casos'
    if (pair) return parseInt(pair[2], 10)
    return undefined
}

const rows = []
for (const line of tableLines) {   // ONE point per table ENTRY (rows are not deduped by day)
    const c = cells(line)
    const date = c.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
    if (!date) continue                                        // header / separator / non-data rows
    const covCell = c.find(x => cov.test(x))
    const m = covCell ? cov.exec(covCell) : undefined
    rows.push({
        date,
        lines: m ? num(m[1]) : undefined,
        branches: m ? num(m[2]) : undefined,
        funcs: m ? num(m[3]) : undefined,
        harness: iHarness >= 0 ? parseHarness(c[iHarness]) : undefined,
        e2e: iE2e >= 0 ? parseE2eCases(c[iE2e]) : undefined,
    })
}
rows.reverse()   // md is newest-first; plot oldest -> newest
if (rows.length === 0) { console.error('no dated rows found in ' + mdPath); process.exit(1) }

// ── SVG chart builder ────────────────────────────────────────────────────────────────────────────────────
const W = 900, H = 460, ML = 56, MR = 150, MT = 54, MB = 64
const plotW = W - ML - MR, plotH = H - MT - MB
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const buildSvg = (chartTitle, chartRows, series, yAxis, xLabel) => {
    const vals = chartRows.flatMap(r => series.map(s => r[s.key]).filter(v => v !== undefined))
    const { min: yMin, max: yMax, ticks } = yAxis(vals)
    const x = i => ML + (chartRows.length === 1 ? plotW / 2 : (plotW * i) / (chartRows.length - 1))
    const y = v => MT + plotH - (plotH * (v - yMin)) / (yMax - yMin)

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">`
    svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`
    svg += `<text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="600" fill="#111">${esc(chartTitle)}</text>`
    for (const t of ticks) {
        svg += `<line x1="${ML}" y1="${y(t.v)}" x2="${ML + plotW}" y2="${y(t.v)}" stroke="#eee" stroke-width="1"/>`
        svg += `<text x="${ML - 8}" y="${y(t.v) + 4}" text-anchor="end" font-size="11" fill="#666">${t.label}</text>`
    }
    chartRows.forEach((r, i) => {
        svg += `<line x1="${x(i)}" y1="${MT + plotH}" x2="${x(i)}" y2="${MT + plotH + 4}" stroke="#999"/>`
        svg += `<text x="${x(i)}" y="${MT + plotH + 20}" text-anchor="middle" font-size="10" fill="#666">${esc(r.date.slice(5))}</text>`
    })
    svg += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="#999"/>`
    svg += `<line x1="${ML}" y1="${MT + plotH}" x2="${ML + plotW}" y2="${MT + plotH}" stroke="#999"/>`
    for (const s of series) {
        // Una fila sin dato para esta serie (harness 'n/a', e2e manual) parte la linea en vez de inventar
        // un valor: el punto simplemente no existe.
        let run = []
        const flush = () => {
            if (run.length > 1) svg += `<polyline points="${run.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`
            run = []
        }
        chartRows.forEach((r, i) => {
            const v = r[s.key]
            if (v === undefined) { flush(); return }
            run.push(`${x(i)},${y(v)}`)
            svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"/>`
        })
        flush()
    }
    series.forEach((s, i) => {
        const ly = MT + 10 + i * 22
        svg += `<line x1="${ML + plotW + 16}" y1="${ly}" x2="${ML + plotW + 40}" y2="${ly}" stroke="${s.color}" stroke-width="3"/>`
        svg += `<circle cx="${ML + plotW + 28}" cy="${ly}" r="3.5" fill="${s.color}"/>`
        svg += `<text x="${ML + plotW + 46}" y="${ly + 4}" font-size="12" fill="#333">${s.label}</text>`
    })
    svg += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#888">${esc(xLabel)}</text>`
    svg += `</svg>`
    return svg
}

// eje de porcentajes: marcas de 5 en 5 alrededor de los valores, recortado a [0, 100]
const percentAxis = (vals) => {
    const min = Math.max(0, Math.floor(Math.min(...vals) / 5) * 5 - 5)
    let max = Math.min(100, Math.ceil(Math.max(...vals) / 5) * 5 + 5)
    if (max - min < 10) max = Math.min(100, min + 10)
    const ticks = []
    for (let v = min; v <= max + 0.001; v += 5) ticks.push({ v, label: `${v}%` })
    return { min, max, ticks }
}

// eje de conteos: siempre desde 0 (una suite que crece de 500 a 507 no debe parecer que se duplica)
const countAxis = (vals) => {
    const top = Math.max(...vals)
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => top / s <= 8) ?? 2000
    const max = Math.max(step, Math.ceil(top / step) * step)
    const ticks = []
    for (let v = 0; v <= max; v += step) ticks.push({ v, label: String(v) })
    return { min: 0, max, ticks }
}

// ── render both charts ───────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })

const shoot = async (svg, out) => {
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`, { waitUntil: 'load' })
    await page.locator('svg').screenshot({ path: out })
}

const covRows = rows.filter(r => r.lines !== undefined)
if (covRows.length === 0) console.warn(`skipping ${pngPath}: no 'L% / B% / F%' cell in ${mdPath}`)
else {
    const series = [
        { key: 'lines', label: 'Lines', color: '#2563eb' },
        { key: 'branches', label: 'Branches', color: '#16a34a' },
        { key: 'funcs', label: 'Functions', color: '#d97706' },
    ]
    await shoot(buildSvg(title, covRows, series, percentAxis, 'CL9 date'), pngPath)
    console.log(`wrote ${pngPath} (${covRows.length} points: ${covRows.map(r => r.date).join(', ')})`)
}

const testRows = rows.filter(r => r.harness !== undefined || r.e2e !== undefined)
if (testRows.length === 0) console.warn(`skipping ${testsPngPath}: no harness/e2e counts in ${mdPath}`)
else {
    const series = [
        { key: 'harness', label: 'Harness tests', color: '#7c3aed' },
        { key: 'e2e', label: 'e2e cases', color: '#db2777' },
    ]
    await shoot(buildSvg(testsTitle, testRows, series, countAxis, 'CL9 date'), testsPngPath)
    const last = testRows[testRows.length - 1]
    console.log(`wrote ${testsPngPath} (${testRows.length} points, latest: harness=${last.harness ?? '-'} e2e=${last.e2e ?? '-'})`)
}

await browser.close()
