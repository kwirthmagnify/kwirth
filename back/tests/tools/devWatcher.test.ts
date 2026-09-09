import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// REGRESION: el hot-reload de extensiones dev vigilaba con fs.watch, cuyo evento 'error' es
// ASINCRONO y por tanto se escapa del try/catch que rodeaba la creacion del watcher. Al desaparecer
// el fichero vigilado -- que es exactamente lo que hace un build limpio antes de regenerarlo -- node
// convertia ese error en uncaughtException y se llevaba el core por delante:
//
//     [core] [ERROR] 🚨 UNCAUGHT EXCEPTION
//     Error: EPERM: operation not permitted, watch
//         at FSEvent.FSWatcher._handle.onchange (node:internal/fs/watchers:267:21)
//
// Ahora los cuatro managers (sender, webhook, plugin, provider) vigilan por polling con
// fs.watchFile, que tolera que la ruta se vaya y vuelva.
//
// OJO al leer este test: si la regresion vuelve NO falla con un assert, se muere el proceso de test
// entero. Llegar vivo hasta el final es justamente lo que se comprueba.

// El watcher sondea cada 500ms; se espera con margen para no depender de la carga de la maquina.
const POLL_WAIT = 1500

// El sender publica su 'tag' a traves del schema, que es lo unico observable desde fuera del
// manager: sirve para distinguir si la version cargada es la vieja o la recargada.
const senderSource = (tag: string) => `
class DevWatchTestSender {
    id = 'devwatchtest'
    addConfig() {}
    removeConfig() {}
    hasConfig() { return false }
    getConfigNames() { return [] }
    getConfigSchema() { return [{ name: '${tag}', label: '${tag}' }] }
    async send() {}
    async startSender() {}
    async stopSender() {}
}
module.exports = { DevWatchTestSender }
`

const emptyConfigMaps = (): IConfigMaps => ({
    write: async () => {},
    read: async (_name: string, defaultValue?: any) => defaultValue,
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('dev watcher: borrar el back.js vigilado no tumba el proceso, y al reaparecer recarga', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-devwatch-'))
    const dist = path.join(root, 'dist')
    fs.mkdirSync(dist)
    const backPath = path.join(dist, 'back.js')
    fs.writeFileSync(backPath, senderSource('v1'))
    fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ name: 'devwatchtest', version: '0.0.1' }))
    fs.writeFileSync(path.join(root, 'kwirth-dev.json'), JSON.stringify({ senders: { devwatchtest: './dist' } }))

    // registerDevSender es privado: se entra por loadDevSenders, que lee kwirth-dev.json del cwd.
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
        const manager = new SenderManager(emptyConfigMaps())
        manager.loadDevSenders()
        assert.deepEqual(manager.getDevIds(), ['devwatchtest'], 'el sender dev debe quedar registrado')
        assert.equal(manager.getSchema('devwatchtest')[0].name, 'v1')

        // Lo que hacia caer el core, TAL CUAL: un build limpio hace 'rm -rf dist' y se lleva el
        // DIRECTORIO, no solo el fichero. Borrar unicamente el fichero no reproduce el fallo: es
        // perder el directorio vigilado lo que mata el handle de fs.watch con EPERM en Windows.
        fs.rmSync(dist, { recursive: true, force: true })
        await wait(POLL_WAIT)
        assert.equal(manager.getSchema('devwatchtest')[0].name, 'v1', 'no debe recargar mientras el fichero no existe')

        // Y cuando el build lo regenera, el hot-reload si tiene que dispararse.
        fs.mkdirSync(dist, { recursive: true })
        fs.writeFileSync(backPath, senderSource('v2'))
        await wait(POLL_WAIT)
        assert.equal(manager.getSchema('devwatchtest')[0].name, 'v2', 'debe recargar en cuanto el fichero reaparece')
    }
    finally {
        fs.unwatchFile(backPath)
        process.chdir(previousCwd)
        fs.rmSync(root, { recursive: true, force: true })
    }
})
