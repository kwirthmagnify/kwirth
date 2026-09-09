import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staleDevLogins, ILoginMeta } from '../../src/tools/LoginManager'
import { staleDevDocs, IDocsMeta } from '../../src/tools/DocsManager'

// kwirth-dev.json es DECLARATIVO: lo que figura queda instalado, lo que se quita se desinstala. Los
// plugins ya se comportaban asi porque su registro de dev vive solo en memoria, pero logins y docs hacen
// una instalacion REAL —escriben en ConfigMaps— y por eso quitar la linea no bastaba: la entrada
// sobrevivia en el indice y el manager la seguia dando por instalada para siempre.
//
// Lo que NO se puede romper al arreglarlo: lo instalado desde un marketplace, una URL, un fichero, un
// pack o el bundle no lo declara nadie en kwirth-dev.json y tiene que quedarse.

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
    // El tgz no existe todavia, asi que no se pudo reinstalar y no aporta id: lo salva la clave del fichero
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
    // Mismo id bajo dos targetType: instalar uno no puede salvar al otro
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
