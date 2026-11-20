/*  The extension tags for the scaffolders (plan: plans/completed/extension-taxonomy/PRD.md).
 *
 *  Every extension declares in its package.json what it is FOR — `"tags": ["observability", "log"]` — and the
 *  values come from a CLOSED catalogue: the EExtensionTag enum of kwirth-common. The scaffolders are what keeps
 *  a new extension inside it, because they only accept catalogue tags (the builds just copy them).
 *
 *  🔴 The catalogue is READ from common/src/ExtensionTag.ts, never copied here: a second list would drift from
 *  the enum the day somebody adds a tag, which is exactly the `log` / `logs` problem the catalogue exists to
 *  prevent. The scaffolders live in the same repo as common, so the file is always there.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'common', 'src', 'ExtensionTag.ts')

/** The catalogue, in the enum's order: every `NAME = 'value'` inside `enum EExtensionTag { … }`. */
export const extensionTagCatalog = () => {
    const source = fs.readFileSync(CATALOG_FILE, 'utf-8')
    const body = source.match(/export enum EExtensionTag\s*{([^}]*)}/)
    if (!body) throw new Error(`EExtensionTag not found in ${CATALOG_FILE}`)
    return [...body[1].matchAll(/=\s*'([^']+)'/g)].map(m => m[1])
}

/** 'ai, kubernetes ai' → ['ai', 'kubernetes']. Commas or spaces, repeats dropped. */
const splitTags = (text) => [...new Set(text.split(/[\s,]+/).map(t => t.trim()).filter(Boolean))]

/** What is wrong with a tag list, or undefined when it is fine: at least one, all from the catalogue. */
export const tagsProblem = (tags, catalog) => {
    if (tags.length === 0) return 'at least one tag is required'
    const unknown = tags.filter(t => !catalog.includes(t))
    return unknown.length ? `not in the catalogue: ${unknown.join(', ')}` : undefined
}

/** The catalogue as columns, for the prompt and for --help. */
export const formatCatalog = (catalog, columns = 5) => {
    const width = Math.max(...catalog.map(t => t.length)) + 2
    const rows = []
    for (let i = 0; i < catalog.length; i += columns) rows.push('    ' + catalog.slice(i, i + columns).map(t => t.padEnd(width)).join('').trimEnd())
    return rows.join('\n')
}

/*  The tags of the extension being created.
 *
 *  · --tags given (non-interactive or not): it must be valid, or the scaffold stops — an extension created with
 *    a typo in its tags would be published that way.
 *  · non-interactive without --tags: it stops too, like --publisher. There is no sensible default: a tag says
 *    what the extension is for, and only whoever writes it knows.
 *  · interactive: the catalogue is shown and the question repeats until the answer is valid.
 */
export const askTags = async (flagValue, interactive, ask) => {
    const catalog = extensionTagCatalog()
    if (flagValue !== undefined || !interactive) {
        const tags = splitTags(flagValue ?? '')
        const problem = flagValue === undefined ? '--tags is required when --id is given (non-interactive mode)' : tagsProblem(tags, catalog)
        if (problem) {
            console.error(`Error: ${problem}.\n\n  --tags takes a comma-separated list from the catalogue:\n\n${formatCatalog(catalog)}\n`)
            process.exit(1)
        }
        return tags
    }
    console.log(`\nTags say what the extension is for. Pick one or more from the catalogue:\n\n${formatCatalog(catalog)}\n`)
    for (;;) {
        const tags = splitTags(await ask('Tags (comma-separated)'))
        const problem = tagsProblem(tags, catalog)
        if (!problem) return tags
        console.log(`  ${problem}`)
    }
}
