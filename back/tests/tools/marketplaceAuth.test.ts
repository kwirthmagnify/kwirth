import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarketplaceManager } from '../../src/tools/MarketplaceManager'
import { EManifestAuthType, IMarketplace } from '@kwirthmagnify/kwirth-common'

// Cabeceras con las que el back lee un manifest privado. Son independientes de las credenciales del
// registro de paquetes: un manifest en un GitLab privado y unos tarballs en un Nexus son dos servidores.

const mkp = (manifestAuth?: { type: EManifestAuthType }): IMarketplace =>
    ({ id: 'nexus', url: 'https://example.com/manifest.json', label: 'Nexus', enabled: true, ...(manifestAuth ? { manifestAuth } : {}) })

test('PRIVATE_TOKEN manda la cabecera PRIVATE-TOKEN (GitLab)', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.PRIVATE_TOKEN }), 'glpat-xxx')
    assert.deepEqual(h, { 'PRIVATE-TOKEN': 'glpat-xxx' })
})

test('BEARER manda Authorization: Bearer', () => {
    const h = MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.BEARER }), 'abc123')
    assert.deepEqual(h, { Authorization: 'Bearer abc123' })
})

test('sin token no se manda cabecera aunque el tipo lo pida', () => {
    assert.deepEqual(MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.PRIVATE_TOKEN }), undefined), {})
    assert.deepEqual(MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.PRIVATE_TOKEN }), ''), {})
})

test('NONE o sin manifestAuth no manda cabecera aunque haya token', () => {
    assert.deepEqual(MarketplaceManager.buildManifestHeaders(mkp({ type: EManifestAuthType.NONE }), 'glpat-xxx'), {})
    assert.deepEqual(MarketplaceManager.buildManifestHeaders(mkp(), 'glpat-xxx'), {})
})

test('el marketplace publico nunca lleva cabeceras', () => {
    // clave: el token de un marketplace privado no puede acabar viajando a raw.githubusercontent.com
    assert.deepEqual(MarketplaceManager.buildManifestHeaders(undefined, 'glpat-xxx'), {})
})
