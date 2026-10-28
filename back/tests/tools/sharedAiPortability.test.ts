import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { redactSharedAi, ISharedAiStore } from '../../src/tools/SharedAiPortability'

/*
    The common AI store travelling in a configuration bundle.

    What is pinned down here is the rule of `common/src/ConfigBundle.ts`: a credential that is not asked
    for travels EMPTY, and nothing else stops travelling because of it. The two regressions this guards
    against are opposite and were both live: providers vanishing from a bundle along with everything
    that was NOT a secret, and model keys going out in clear in a bundle exported without credentials.
*/

const proveedor = (over: Partial<ILlmProvider> = {}): ILlmProvider => ({
    name: 'HUAWEI',
    type: 'openai-compat',
    key: 'sk-huawei-REAL',
    models: [{ id: 'glm-5.2', name: 'GLM 5.2', description: 'GLM 5.2 en Huawei MaaS', type: 'text' }],
    endpoint: 'https://maas.example.com/v1',
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 4.25,
    limits: { cost: { enabled: true, daily: 20 } },
    ...over
})

const modelo = (over: Partial<ILlm> = {}): ILlm => ({
    id: 'glm',
    provider: 'HUAWEI',
    model: 'glm-5.2',
    temperature: 0.2,
    useProviderKey: true,
    key: '',
    ...over
})

const almacen = (over: Partial<ISharedAiStore> = {}): ISharedAiStore => ({
    llms: [modelo()],
    providers: [proveedor()],
    ...over
})

// ─── with credentials: what was asked for is what travels ──────────────────────

test('con credenciales las keys salen tal cual: es lo que se ha pedido', () => {
    const salida = redactSharedAi(almacen({ llms: [modelo({ id: 'propia', useProviderKey: false, key: 'sk-model-REAL' })] }), true)
    assert.equal(salida.providers[0].key, 'sk-huawei-REAL')
    assert.equal(salida.llms[0].key, 'sk-model-REAL')
})

// ─── without credentials: everything travels, the keys travel empty ────────────

test('🔴 sin credenciales los providers VIAJAN: no desaparecen con sus keys', () => {
    const salida = redactSharedAi(almacen(), false)
    assert.equal(salida.providers.length, 1)
    assert.equal(salida.providers[0].name, 'HUAWEI')
})

test('sin credenciales la key del provider va VACIA, no omitida', () => {
    const salida = redactSharedAi(almacen(), false)
    assert.equal(salida.providers[0].key, '')
    assert.ok('key' in salida.providers[0], 'el destino tiene que saber que el campo existe para pedir que lo rellenen')
})

test('sin credenciales se conserva todo lo que NO es secreto del provider', () => {
    const salida = redactSharedAi(almacen(), false)
    const p = salida.providers[0]
    assert.equal(p.type, 'openai-compat')
    assert.equal(p.endpoint, 'https://maas.example.com/v1')
    assert.equal(p.inputCostPerMillion, 1.5)
    assert.equal(p.outputCostPerMillion, 4.25)
    assert.deepEqual(p.limits, { cost: { enabled: true, daily: 20 } })
    assert.deepEqual(p.models, [{ id: 'glm-5.2', name: 'GLM 5.2', description: 'GLM 5.2 en Huawei MaaS', type: 'text' }])
})

test('🔴 sin credenciales un modelo con key propia NO se la lleva en claro', () => {
    const salida = redactSharedAi(almacen({ llms: [modelo({ id: 'propia', useProviderKey: false, key: 'sk-model-REAL' })] }), false)
    assert.equal(salida.llms[0].key, '')
    assert.equal(salida.llms[0].id, 'propia')
    assert.equal(salida.llms[0].useProviderKey, false)
})

test('la key se vacia aunque el modelo use la del provider: guardada y sin usar sigue siendo un secreto', () => {
    const salida = redactSharedAi(almacen({ llms: [modelo({ useProviderKey: true, key: 'sk-vieja-REAL' })] }), false)
    assert.equal(salida.llms[0].key, '')
})

test('un modelo sin key propia viaja entero y sin tocar', () => {
    const salida = redactSharedAi(almacen({ llms: [modelo({ temperature: 0.7 })] }), false)
    assert.deepEqual(salida.llms[0], modelo({ temperature: 0.7 }))
})

// ─── it does not touch what it was given ───────────────────────────────────────

test('no muta el almacen de entrada: lo leido de k8s se queda como esta', () => {
    const entrada = almacen({ llms: [modelo({ useProviderKey: false, key: 'sk-model-REAL' })] })
    redactSharedAi(entrada, false)
    assert.equal(entrada.providers[0].key, 'sk-huawei-REAL')
    assert.equal(entrada.llms[0].key, 'sk-model-REAL')
})

test('listas vacias: no revienta y devuelve las dos claves', () => {
    const salida = redactSharedAi({ llms: [], providers: [] }, false)
    assert.deepEqual(salida, { llms: [], providers: [] })
})
