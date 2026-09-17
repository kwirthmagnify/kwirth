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

// Un canal de pega con niveles de scope: 'view' es el minimo, 'restart' puede mas, 'cluster' lo maximo.
// getScopeLevel pregunta al CANAL por el nivel de cada scope, asi que el catalogo lo pone el canal.
const NIVELES: Record<string, number> = { view: 10, filter: 10, restart: 50, cluster: 100 }

const fakeChannels = (): Map<string, IChannel> => new Map([
    ['log', { getChannelScopeLevel: (scope: string) => NIVELES[scope] ?? -1 } as unknown as IChannel]
])

/** Una instanceConfig con la accessKey serializada dentro, que es de donde la saca checkAkr. */
const configCon = (resources: string, scope = 'view'): IInstanceConfig => ({
    channel: 'log',
    scope,
    accessKey: accessKeySerialize(accessKeyBuild('id-1', 'permanent', resources))
} as unknown as IInstanceConfig)

// ── checkResource: el filtro de recursos ─────────────────────────────────────────────────────────────

test('un campo vacio en la clave significa CUALQUIERA, no ninguno', () => {
    // 'view::::' es "ver lo que sea": sin esto, una clave sin namespaces no daria acceso a nada.
    const r = parseResource('view::::')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-1', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'lo-que-sea', 'x', 'y'), true)
})

test('los namespaces se comparan como LISTA, no como cadena entera', () => {
    // 'prod,dev' tiene que valer para prod Y para dev. Compararlo entero contra 'prod' fallaria en ambos.
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
    // Es lo que permite 'todos los pods de la app': sin regex habria que enumerarlos uno a uno.
    const r = parseResource('view:prod::api-.*:')
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'api-7f6b', 'app'), true)
    assert.equal(AuthorizationManagement.checkResource(r, 'prod', 'web-1', 'app'), false)
})

// ── checkAkr: la puerta de verdad ────────────────────────────────────────────────────────────────────

test('🔴 una clave con VARIOS recursos vale si encaja cualquiera de ellos', () => {
    // El fallo que tenia la difunta `validAuth`: mirar solo el primero. Con esta clave, el acceso a dev
    // se caia aunque la clave lo concediera explicitamente.
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
    // pide 'view' teniendo 'restart' (50): de sobra — el nivel es un techo, no una igualdad
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('restart:prod:::', 'view'), 'prod', 'p', 'c'), true)
})

test('de varios scopes en un recurso manda el MAS ALTO', () => {
    // 'view,restart' tiene que poder reiniciar: se queda con el nivel mayor, no con el primero.
    const channels = fakeChannels()
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('view,restart:prod:::', 'restart'), 'prod', 'p', 'c'), true)
})

test('el nivel se comprueba POR recurso: no se mezcla el scope de uno con el namespace de otro', () => {
    // 'view en prod' + 'restart en dev' NO puede convertirse en 'restart en prod'. Es el error clasico al
    // recorrer varios recursos: quedarse con el mejor scope de todos y aplicarlo a cualquier sitio.
    const channels = fakeChannels()
    const config = configCon('view:prod:::;restart:dev:::', 'restart')

    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'dev', 'p', 'c'), true, 'restart en dev, que es lo que concede')
    assert.equal(AuthorizationManagement.checkAkr(channels, config, 'prod', 'p', 'c'), false, 'en prod solo tiene view: no puede reiniciar')
})

test('un scope que el canal no conoce no da acceso', () => {
    // getChannelScopeLevel devuelve -1 para lo desconocido. Una clave con un scope inventado no debe
    // colarse por el hueco.
    const channels = fakeChannels()
    assert.equal(AuthorizationManagement.checkAkr(channels, configCon('inventado:prod:::', 'view'), 'prod', 'p', 'c'), false)
})
