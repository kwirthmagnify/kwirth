/*
    Publishes the Kwirth Helm chart to the repository served by the website (docs/helm-charts, GitHub Pages
    at https://kwirthmagnify.dev/helm-charts).

    What it does, in order, and it stops at the first failure:
      1. refuses to publish a chart version that is already in the repository (a published tgz is immutable:
         bump 'version' in Chart.yaml instead)
      2. helm lint
      3. the unit tests (node --test deploy/helm/tests/chart.test.mjs)
      4. helm package  -> docs/helm-charts/kwirth-<version>.tgz
      5. helm repo index, regenerated from every tgz in the folder, with the website URL

    It does NOT commit, tag or push: that is the closing checklist. Run from anywhere:
      node deploy/helm/publish-chart.mjs
*/
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const chartDir = path.join(here, 'kwirth')
const repoDir = path.resolve(here, '..', '..', 'docs', 'helm-charts')
const repoUrl = 'https://kwirthmagnify.dev/helm-charts'

const run = (cmd, args) => {
    console.log(`> ${cmd} ${args.join(' ')}`)
    execFileSync(cmd, args, { stdio: 'inherit' })
}

const chartYaml = readFileSync(path.join(chartDir, 'Chart.yaml'), 'utf8')
const version = chartYaml.match(/^version:\s*"?([^"\s]+)"?/m)?.[1]
const appVersion = chartYaml.match(/^appVersion:\s*"?([^"\s]+)"?/m)?.[1]
if (!version || !appVersion) {
    console.error('Chart.yaml: could not read version/appVersion')
    process.exit(1)
}

const tgz = path.join(repoDir, `kwirth-${version}.tgz`)
if (existsSync(tgz)) {
    console.error(`Chart ${version} is already published (${tgz}). A published chart is immutable: bump the version in Chart.yaml.`)
    process.exit(1)
}

console.log(`Publishing kwirth chart ${version} (app ${appVersion}) to ${repoDir}`)
run('helm', ['lint', chartDir])
run(process.execPath, ['--test', path.join(here, 'tests', 'chart.test.mjs')])
run('helm', ['package', chartDir, '-d', repoDir])
run('helm', ['repo', 'index', repoDir, '--url', repoUrl])

console.log('\nPublished charts now in the repository:')
for (const f of readdirSync(repoDir).filter(f => f.endsWith('.tgz')).sort()) console.log(`  ${f}`)
console.log(`\nNext: commit docs/helm-charts (index.yaml + the new tgz), tag chart/kwirth@${version} and push. The repository is live once GitHub Pages picks the commit up.`)
