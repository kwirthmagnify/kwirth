export { loadModels } from '@kwirthmagnify/kwirth-common-ai/back'

/*
    Reads a value from a nested object by a dotted path ('lastError.data.error.message').

    It exists so that lodash does not have to: `_.get` was the only thing this plugin used from it, and
    bundling the whole of lodash for one call put 219 KB into back.js — 48% of the bundle, for four lines.

    It never throws: an intermediate step that is not an object simply gives undefined, which is what the
    caller wants when digging into an error whose shape depends on which LLM provider produced it.
*/
export const valueAt = (source: unknown, path: string): string|undefined => {
    if (!path) return undefined
    let current: unknown = source
    for (const key of path.split('.')) {
        if (current === null || typeof current !== 'object') return undefined
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' ? current : undefined
}
