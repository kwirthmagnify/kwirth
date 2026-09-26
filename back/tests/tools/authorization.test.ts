import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthorizationManagement } from '../../src/tools/AuthorizationManagement'
import { IChannel } from '@kwirthmagnify/kwirth-common-back'
import { IInstanceConfig, accessKeySerialize, accessKeyBuild, parseResource } from '@kwirthmagnify/kwirth-common'

/*
    El control de permisos de Kwirth: `checkAkr` (quien autoriza de verdad, llamado desde index.ts al
    añadir objetos a una instancia) y `checkResource` (el filtro por namespace/pod/container).

    No tenian ni un test, y son la puerta por la que pasa el acceso a los recursos del cluster. Se escriben
    al abordar S4 (plan: plans/ai-tools/PLAN.md), porque la autorizacion de tools va a reutilizar esta misma
    semantica y conviene tenerla fijada ANTES de apoyarse en ella.

    Lo que se fija:
      · una accessKey con VARIOS recursos vale si encaja CUALQUIERA de ellos (OR, no el primero)
      · un campo vacio en la clave significa "cualquiera", no "ninguno"
      · los campos se comparan como lista de regex, no como cadena entera
*/

// A fake channel with scope levels: 'view' is the minimum, 'restart' can do more, 'cluster' the most.
// getScopeLevel asks the CHANNEL for each scope's level, so the catalogue is provided by the channel.
const NIVELES: Record<string, number> = { view: 10, filter: 10, restart: 50, cluster: 100 }

const fakeChannels = (): Map<string, IChannel> => new Map([
    ['log', { getChannelScopeLevel: (scope: string) => NIVELES[scope] ?? -1 } as unknown as IChannel]
])

/** An instanceConfig with the accessKey serialised inside, which is where checkAkr takes it from. */
const configCon = (resources: string, scope = 'view'): IInstanceConfig => ({
    channel: 'log',
    scope,
    accessKey: accessKeySerialize(accessKeyBuild('id-1', 'permanent', resources))
} as unknown as IInstanceConfig)

// ── checkResource: the resource filter ───────────────────────────────────────────────────────────────

test('un campo vacio en la clave significa CUALQUIERA, no ninguno', () => {
    // 'view::::' means "view anything": without this, a key with no namespaces would grant access to nothing.
    const r = parseResource('view::::')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-1', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'lo-que-sea', 'x', 'y'), true)
})

test('los namespaces se comparan como LISTA, no como cadena entera', () => {
    // 'prod,dev' has to work for prod AND for dev. Comparing it whole against 'prod' would fail on both.
    const r = parseResource('view:prod,dev:::')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-1', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'dev', 'api-1', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'staging', 'api-1', 'app'), false)
})

test('pods y containers filtran igual que los namespaces', () => {
    const r = parseResource('view:prod::api-1,api-2:app')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-2', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'otro-pod', 'app'), false)
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-1', 'sidecar'), false)
})

test('los valores son REGEX, no nombres literales', () => {
    // It is what allows 'every pod of the app': without a regex they would have to be enumerated one by one.
    const r = parseResource('view:prod::api-.*:')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-7f6b', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'web-1', 'app'), false)
})

// ── checkAkr: the real gate ──────────────────────────────────────────────────────────────────────────

test('🔴 una clave con VARIOS recursos vale si encaja cualquiera de ellos', () => {
    // The fault the late `validAuth` had: looking at the first one only. With this key, access to dev
    // fell through even though the key granted it explicitly.
    const config = configCon('view:prod:::;view:dev:::')
    const channels = fakeChannels()

    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'prod', 'api-1', 'app'), true)
    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'dev', 'api-1', 'app'), true, 'el segundo recurso tambien cuenta')
    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'staging', 'api-1', 'app'), false)
})

test('el nivel de scope lo pone el CANAL, y hay que llegar al pedido', () => {
    const channels = fakeChannels()

    // pide 'view' (10) teniendo 'view' (10): llega
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('view:prod:::', 'view'), 'prod', 'p', 'c'), true)
    // pide 'restart' (50) teniendo solo 'view' (10): no llega
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('view:prod:::', 'restart'), 'prod', 'p', 'c'), false)
    // asks for 'view' while holding 'restart' (50): more than enough — the level is a ceiling, not an equality
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('restart:prod:::', 'view'), 'prod', 'p', 'c'), true)
})

test('de varios scopes en un recurso manda el MAS ALTO', () => {
    // 'view,restart' has to be able to restart: it keeps the highest level, not the first one.
    const channels = fakeChannels()
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('view,restart:prod:::', 'restart'), 'prod', 'p', 'c'), true)
})

test('el nivel se comprueba POR recurso: no se mezcla el scope de uno con el namespace de otro', () => {
    // 'view on prod' + 'restart on dev' must NOT become 'restart on prod'. It is the classic mistake when
    // walking several resources: keeping the best scope of them all and applying it anywhere.
    const channels = fakeChannels()
    const config = configCon('view:prod:::;restart:dev:::', 'restart')

    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'dev', 'p', 'c'), true, 'restart en dev, que es lo que concede')
    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'prod', 'p', 'c'), false, 'en prod solo tiene view: no puede reiniciar')
})

test('un scope que el canal no conoce no da acceso', () => {
    // getChannelScopeLevel returns -1 for the unknown. A key with a made-up scope must not slip through
    // that gap.
    const channels = fakeChannels()
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('inventado:prod:::', 'view'), 'prod', 'p', 'c'), false)
})
