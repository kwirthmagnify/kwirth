import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// REGRESSION: the hot reload of dev extensions watched with fs.watch, whose 'error' event is
// ASYNCHRONOUS and therefore escapes the try/catch that surrounded the watcher's creation. When the
// watched file vanished -- which is exactly what a clean build does before regenerating it -- node
// turned that error into an uncaughtException and took the core down with it:
//
//     [core] [ERROR] 🚨 UNCAUGHT EXCEPTION
//     Error: EPERM: operation not permitted, watch
//         at FSEvent.FSWatcher._handle.onchange (node:internal/fs/watchers:267:21)
//
// The four managers (sender, webhook, plugin, provider) now watch by polling with fs.watchFile, which
// tolerates the path going away and coming back.
//
// CAREFUL when reading this test: if the regression comes back it does NOT fail with an assert, the
// whole test process dies. Getting to the end alive is precisely what is being checked.

// The watcher polls every 500ms; the wait is generous so as not to depend on the machine's load.
const POLL_WAIT = 1500

// The sender publishes its 'tag' through the schema, which is the only thing observable from outside
// the manager: it serves to tell whether the loaded version is the old one or the reloaded one.
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

    // registerDevSender is private: we come in through loadDevSenders, which reads kwirth-dev.json from the cwd.
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
        const manager = new SenderManager(emptyConfigMaps())
        manager.loadDevSenders()
        assert.deepEqual(manager.getDevIds(), ['devwatchtest'], 'el sender dev debe quedar registrado')
        assert.equal(manager.getSchema('devwatchtest')[0].name, 'v1')

        // What brought the core down, EXACTLY AS IT WAS: a clean build does 'rm -rf dist' and takes the
        // DIRECTORY, not just the file. Deleting only the file does not reproduce the fault: it is losing
        // the watched directory that kills fs.watch's handle with EPERM on Windows.
        fs.rmSync(dist, { recursive: true, force: true })
        await wait(POLL_WAIT)
        assert.equal(manager.getSchema('devwatchtest')[0].name, 'v1', 'no debe recargar mientras el fichero no existe')

        // And when the build regenerates it, the hot reload does have to fire.
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
