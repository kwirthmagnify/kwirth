// Coverage-chart generator (CL9 point 2c) — SHARED TOOL, lives here so agents find it.
//
//   node tools/gen-coverage-chart.mjs <path to docs/qa/test-metrics-history.md> <out .png> [title]
//
// Reads a test-metrics-history.md, plots the 3 coverage series (lines / branches / funcs) over time as a
// line chart, and screenshots it to PNG with Playwright (resolved from any plugin's e2e install — no new
// dep). One point PER TABLE ENTRY (one per row). Rows whose coverage cell
// is not "L% / B% / F%" are skipped; the decimal separator may be '.' or ',' and a space before % is fine.
//
// Used by every CL9 close: each plugin/provider (and the core) regenerates its docs/qa/test-metrics-coverage.png.

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

// ── parse the markdown table (column order varies; find cells by content) ────────────────────────────────
const md = readFileSync(mdPath, 'utf8')
const cov = /([\d.,]+)\s*%\s*\/\s*([\d.,]+)\s*%\s*\/\s*([\d.,]+)\s*%/   // '.' or ',' decimals, optional space
const num = s => parseFloat(String(s).replace(',', '.'))
const rows = []
for (const line of md.split('\n')) {   // ONE point per table ENTRY (rows are not deduped by day)
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim().replace(/`/g, ''))
    const date = cells.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c))
    const covCell = cells.find(c => cov.test(c))
    if (!date || !covCell) continue                       // header / separator / non-coverage rows
    const m = cov.exec(covCell)
    rows.push({ date, lines: num(m[1]), branches: num(m[2]), funcs: num(m[3]) })
}
rows.reverse()   // md is newest-first; plot oldest -> newest
if (rows.length === 0) { console.error('no coverage rows found in ' + mdPath); process.exit(1) }

// ── build the SVG ────────────────────────────────────────────────────────────────────────────────────────
const W = 900, H = 460, ML = 56, MR = 150, MT = 54, MB = 64
const plotW = W - ML - MR, plotH = H - MT - MB
const vals = rows.flatMap(r => [r.lines, r.branches, r.funcs])
let yMin = Math.max(0, Math.floor(Math.min(...vals) / 5) * 5 - 5)
let yMax = Math.min(100, Math.ceil(Math.max(...vals) / 5) * 5 + 5)
if (yMax - yMin < 10) yMax = Math.min(100, yMin + 10)
const x = i => ML + (rows.length === 1 ? plotW / 2 : (plotW * i) / (rows.length - 1))
const y = v => MT + plotH - (plotH * (v - yMin)) / (yMax - yMin)
const series = [
    { key: 'lines', label: 'Lines', color: '#2563eb' },
    { key: 'branches', label: 'Branches', color: '#16a34a' },
    { key: 'funcs', label: 'Functions', color: '#d97706' },
]
const yticks = []
for (let v = yMin; v <= yMax + 0.001; v += 5) yticks.push(v)

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">`
svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`
svg += `<text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="600" fill="#111">${esc(title)}</text>`
for (const v of yticks) {
    svg += `<line x1="${ML}" y1="${y(v)}" x2="${ML + plotW}" y2="${y(v)}" stroke="#eee" stroke-width="1"/>`
    svg += `<text x="${ML - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#666">${v}%</text>`
}
rows.forEach((r, i) => {
    svg += `<line x1="${x(i)}" y1="${MT + plotH}" x2="${x(i)}" y2="${MT + plotH + 4}" stroke="#999"/>`
    svg += `<text x="${x(i)}" y="${MT + plotH + 20}" text-anchor="middle" font-size="10" fill="#666">${esc(r.date.slice(5))}</text>`
})
svg += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="#999"/>`
svg += `<line x1="${ML}" y1="${MT + plotH}" x2="${ML + plotW}" y2="${MT + plotH}" stroke="#999"/>`
for (const s of series) {
    const pts = rows.map((r, i) => `${x(i)},${y(r[s.key])}`).join(' ')
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`
    rows.forEach((r, i) => { svg += `<circle cx="${x(i)}" cy="${y(r[s.key])}" r="3.5" fill="${s.color}"/>` })
}
series.forEach((s, i) => {
    const ly = MT + 10 + i * 22
    svg += `<line x1="${ML + plotW + 16}" y1="${ly}" x2="${ML + plotW + 40}" y2="${ly}" stroke="${s.color}" stroke-width="3"/>`
    svg += `<circle cx="${ML + plotW + 28}" cy="${ly}" r="3.5" fill="${s.color}"/>`
    svg += `<text x="${ML + plotW + 46}" y="${ly + 4}" font-size="12" fill="#333">${s.label}</text>`
})
svg += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#888">CL9 date</text>`
svg += `</svg>`

// ── render to PNG ────────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`, { waitUntil: 'load' })
await page.locator('svg').screenshot({ path: pngPath })
await browser.close()
console.log(`wrote ${pngPath} (${rows.length} points: ${rows.map(r => r.date).join(', ')})`)
