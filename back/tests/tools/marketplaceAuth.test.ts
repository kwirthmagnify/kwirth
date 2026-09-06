import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarketplaceManager } from '../../src/tools/MarketplaceManager'
import { EManifestAuthType, IMarketplace } from '@kwirthmagnify/kwirth-common'

// Cabeceras con las que el back lee un manifest privado. Son independientes de las credenciales del
// registro de paquetes: un manifest en un GitLab privado y unos tarballs en un Nexus son dos servidores.

const mkp = (manifestAuth?: { type: EManifestAuthType, username?: string }): IMarketplace =>
    ({ id: 'nexus', url: 'https://example.com/manifest.json', label: 'Nexus', enabled: true, ...(manifestAuth ? { manifestAuth } : {}) })

/** Lo que se manda ademas del Accept, que va siempre. */
const credentials = (h: Record<string, string>) => {
    const { Accept, ...rest } = h
    return rest
}

// ---- Accept ----
//
// La Contents API de GitHub devuelve el fichero en base64 dentro de un JSON salvo que se pida el media
// type 'raw'. Se manda siempre, con comodin detras, para no tener que configurarlo por host.

test('el Accept pide el raw de GitHub pero deja comodin para el resto', () => {
    for (const h of [
        MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BEARER }), 'abc'),
        MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.NONE }), 'abc'),
        MarketplaceManager.buildManifestHeaders(undefined, undefined)
    ]) {
        assert.match(h.Accept, /application\/vnd\.github\.raw/, 'sin esto GitHub devuelve base64 envuelto en JSON')
        assert.match(h.Accept, /\*\/\*/, 'y con comodin para no romper a los demas hosts')
    }
})

// ---- por tipo de auth ----

test('PRIVATE_TOKEN manda la cabecera PRIVATE-TOKEN (GitLab)', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.PRIVATE_TOKEN }), 'glpat-xxx')
    assert.deepEqual(credentials(h), { 'PRIVATE-TOKEN': 'glpat-xxx' })
})

test('BEARER manda Authorization: Bearer (GitHub)', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BEARER }), 'ghp_abc123')
    assert.deepEqual(credentials(h), { Authorization: 'Bearer ghp_abc123' })
})

test('BASIC manda el PAT como CONTRASEÑA, que es como lo espera Azure DevOps', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BASIC }), 'azdo-pat')
    // Azure DevOps ignora el usuario: sin username, la parte de usuario va vacia
    assert.deepEqual(credentials(h), { Authorization: `Basic ${Buffer.from(':azdo-pat').toString('base64')}` })

    // y se puede comprobar al reves, decodificando
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString()
    assert.equal(decoded, ':azdo-pat', 'el token va en la parte de contraseña, no en la de usuario')
})

test('BASIC con username lo usa en la parte de usuario', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BASIC, username: 'ci' }), 'azdo-pat')
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString()
    assert.equal(decoded, 'ci:azdo-pat')
})

test('BASIC codifica bien un token con caracteres no ASCII', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BASIC, username: 'usuario' }), 'contraseña-ñ')
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString('utf-8')
    assert.equal(decoded, 'usuario:contraseña-ñ')
})

// ---- cuando NO se mandan credenciales ----

test('sin token no se manda credencial aunque el tipo lo pida', () => {
    for (const token of [undefined, '']) {
        const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.PRIVATE_TOKEN }), token)
        assert.deepEqual(credentials(h), {})
    }
    assert.deepEqual(credentials(MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BASIC }), undefined)), {})
})

test('NONE o sin manifestAuth no manda credencial aunque haya token', () => {
    assert.deepEqual(credentials(MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.NONE }), 'glpat-xxx')), {})
    assert.deepEqual(credentials(MarketplaceManager.buildManifestHeaders(mkp(), 'glpat-xxx')), {})
})

test('el marketplace publico nunca lleva credenciales', () => {
    // clave: el token de un marketplace privado no puede acabar viajando a raw.githubusercontent.com
    const h = MarketplaceManager.buildManifestHeaders(undefined, 'glpat-xxx')
    assert.deepEqual(credentials(h), {})
})
