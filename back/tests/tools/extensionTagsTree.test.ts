import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import fs from 'fs'
import { isExtensionTag } from '@kwirthmagnify/kwirth-common'

/*
    Every extension in the tree carries its tags, and only catalogue ones (plans/completed/extension-taxonomy, D6).

    The builds copy `tags` to dist/package.json without validating them — 60 extensions do not depend on
    kwirth-common and cannot read the catalogue — so THIS is the check that keeps the tree inside it: a
    `logs` next to `log`, a typo, or an extension created without tags fails here, before it is published.

    It looks at what is in the working tree: the private extensions are nested repos under plugins/,
    providers/… and are checked when they are there; a public clone simply has fewer.
*/

const REPO_ROOT = path.resolve(process.cwd(), '..')

/** The folders each extension type lives in, and the manifests served from the tree. */
const TYPE_DIRS = ['plugins', 'providers', 'senders', 'themes', 'homepages', 'idps', 'logins', 'webhooks', 'aitoolsets', 'dces', 'routers']
const MANIFESTS = [...TYPE_DIRS, 'docs', 'packs', 'marketplace'].map(d => path.join(d, 'manifest.json'))

/** What is wrong with a tags value, or undefined: a non-empty list, all from the catalogue. */
const tagsProblem = (tags: unknown): string | undefined => {
    if (!Array.isArray(tags) || tags.length === 0) return 'no tags'
    const unknown = tags.filter(t => !isExtensionTag(t))
    return unknown.length ? `not in the catalogue: ${unknown.join(', ')}` : undefined
}

/*
    The package.json of every extension: <type>/<id>/package.json, plus the login and the theme a plugin
    brings inside (plugins/iter/login, plugins/iter/theme). Only those with an `id` are extensions — the
    rest are helpers (an agent's build, a scan runner).
*/
const extensionPackages = (): string[] => {
    const found: string[] = []
    for (const dir of TYPE_DIRS) {
        const abs = path.join(REPO_ROOT, dir)
        if (!fs.existsSync(abs)) continue
        for (const id of fs.readdirSync(abs)) {
            for (const sub of ['', 'login', 'theme']) {
                const file = path.join(abs, id, sub, 'package.json')
                if (!fs.existsSync(file)) continue
                const pkg = JSON.parse(fs.readFileSync(file, 'utf-8')) as { id?: unknown }
                if (typeof pkg.id === 'string') found.push(file)
            }
        }
    }
    return found
}

test('every extension package.json carries catalogue tags', () => {
    const files = extensionPackages()
    assert.ok(files.length > 50, `only ${files.length} extensions found — is the cwd back/?`)
    const wrong = files
        .map(file => ({ file, problem: tagsProblem((JSON.parse(fs.readFileSync(file, 'utf-8')) as { tags?: unknown }).tags) }))
        .filter(r => r.problem)
        .map(r => `${path.relative(REPO_ROOT, r.file)}: ${r.problem}`)
    assert.deepEqual(wrong, [])
})

test('every manifest entry carries catalogue tags', () => {
    const wrong: string[] = []
    let entries = 0
    for (const manifest of MANIFESTS) {
        const file = path.join(REPO_ROOT, manifest)
        if (!fs.existsSync(file)) continue
        for (const entry of JSON.parse(fs.readFileSync(file, 'utf-8')) as { extensionType?: string, id?: string, version?: string, tags?: unknown }[]) {
            entries++
            const problem = tagsProblem(entry.tags)
            if (problem) wrong.push(`${manifest} ${entry.extensionType}/${entry.id}@${entry.version}: ${problem}`)
        }
    }
    assert.ok(entries > 100, `only ${entries} manifest entries found`)
    assert.deepEqual(wrong, [])
})
