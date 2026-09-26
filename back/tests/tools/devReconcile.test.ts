import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staleDevLogins, ILoginMeta } from '../../src/tools/LoginManager'
import { staleDevDocs, IDocsMeta } from '../../src/tools/DocsManager'

// kwirth-dev.json is DECLARATIVE: what is listed stays installed, what is removed gets uninstalled.
// Plugins already behaved that way because their dev registry lives only in memory, but logins and docs
// do a REAL installation — they write to ConfigMaps — and that is why removing the line was not enough:
// the entry survived in the index and the manager went on considering it installed forever.
//
// What must NOT break while fixing it: whatever was installed from a marketplace, a URL, a file, a pack
// or the bundle is declared by nobody in kwirth-dev.json and has to stay.

const login = (id: string, installedFrom: string): ILoginMeta =>
    ({ id, name: id, displayName: id, version: '0.1.0', description: '', installedFrom })

const docs = (targetType: string, id: string, installedFrom: string): IDocsMeta =>
    ({ id, targetType, name: id, version: '0.1.0', description: '', installedFrom })

// ---------------- logins ----------------

test('un login de dev que ya no esta en kwirth-dev.json se desinstala', () => {
    const index = [login('magnify', 'dev'), login('agora', 'dev')]
    assert.deepEqual(staleDevLogins(index, new Set(['magnify'])).map(m => m.id), ['agora'])
})

test('un login de dev que sigue declarado se queda', () => {
    const index = [login('magnify', 'dev'), login('agora', 'dev')]
    assert.deepEqual(staleDevLogins(index, new Set(['magnify', 'agora'])), [])
})

test('vaciar la seccion de logins desinstala todos los de dev', () => {
    const index = [login('magnify', 'dev'), login('agora', 'dev')]
    assert.deepEqual(staleDevLogins(index, new Set()).map(m => m.id), ['magnify', 'agora'])
})

test('lo instalado por otras vias no lo toca nadie, aunque no este declarado', () => {
    const index = [
        login('censor', 'bundled'),
        login('santander', 'local'),
        login('excubitor', 'pack:excubitor'),
        login('magnify', 'https://marketplace.example/magnify.tgz')
    ]
    assert.deepEqual(staleDevLogins(index, new Set()), [])
})

test('un login declarado pero sin construir conserva su sitio', () => {
    // The tgz does not exist yet, so it could not be reinstalled and contributes no id: the file's key saves it
    const index = [login('santander', 'dev')]
    assert.deepEqual(staleDevLogins(index, new Set(['santander'])), [])
})

// ---------------- docs ----------------

test('unas docs de dev que ya no estan en kwirth-dev.json se desinstalan', () => {
    const index = [docs('core', 'kwirth', 'dev'), docs('plugin', 'agora', 'dev')]
    const stale = staleDevDocs(index, new Set(['kwirth']), new Set(['core/kwirth']))
    assert.deepEqual(stale.map(d => `${d.targetType}/${d.id}`), ['plugin/agora'])
})

test('unas docs recien instaladas se quedan', () => {
    const index = [docs('plugin', 'excubitor', 'dev')]
    assert.deepEqual(staleDevDocs(index, new Set(['excubitor']), new Set(['plugin/excubitor'])), [])
})

test('la identidad de unas docs es el PAR (targetType, id), no el id solo', () => {
    // The same id under two targetTypes: installing one must not save the other
    const index = [docs('plugin', 'iter', 'dev'), docs('theme', 'iter', 'dev')]
    const stale = staleDevDocs(index, new Set(), new Set(['plugin/iter']))
    assert.deepEqual(stale.map(d => `${d.targetType}/${d.id}`), ['theme/iter'])
})

test('unas docs declaradas pero sin construir conservan su sitio', () => {
    const index = [docs('plugin', 'montag', 'dev')]
    assert.deepEqual(staleDevDocs(index, new Set(['montag']), new Set()), [])
})

test('las docs instaladas por otras vias no se tocan', () => {
    const index = [
        docs('core', 'kwirth', 'bundled'),
        docs('plugin', 'excubitor', 'pack:excubitor'),
        docs('plugin', 'agora', 'https://marketplace.example/docs-agora.tgz'),
        docs('plugin', 'montag', 'local')
    ]
    assert.deepEqual(staleDevDocs(index, new Set(), new Set()), [])
})
