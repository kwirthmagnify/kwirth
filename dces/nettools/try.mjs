// Exercises the BUILT dce (dist/back.js) against the real network, outside Kwirth.
//
//   node try.mjs [target] [name-to-resolve] [ip-to-reverse]
//   node try.mjs example.com example.com 8.8.8.8          (the defaults)
//
// A back-only DCE has no screen and no HTTP route — it is consumed in-process with getDce() — so this
// is how it is checked by hand. It loads the very bundle the core loads, with a host in memory, which
// is the point: what runs here is what runs inside Kwirth, not a copy of the sources.

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const loaded = require('./dist/back.js')
const dce = loaded.default ?? loaded

const store = new Map()
const memory = {
    read: async (name, defaultValue) => store.has(name) ? store.get(name) : defaultValue,
    write: async (name, data) => { store.set(name, data) }
}
const host = {
    id: 'nettools',
    logger: { info: m => console.log(`[info]  ${m}`), warning: m => console.log(`[warn]  ${m}`), error: m => console.log(`[error] ${m}`) },
    configMaps: memory,
    secrets: memory,
    libs: {}
}

const [target = 'example.com', name = 'example.com', address = '8.8.8.8'] = process.argv.slice(2)
const show = (title, result) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 70 - title.length))}\n${JSON.stringify(result, null, 2)}`)

const tools = await dce.create(host)

show(`ping ${target}:443`, await tools.ping(target, { count: 3 }))
show(`ping ${target}:81 (nothing listening)`, await tools.ping(target, { port: 81, count: 2, timeoutMs: 1000 }))
show('ping https://example.com (refused target)', await tools.ping('https://example.com'))
show(`resolve ${name} A`, await tools.resolve(name))
show(`resolve ${name} MX`, await tools.resolve(name, { type: 'MX' }))
show(`resolve ${name} TXT through 1.1.1.1`, await tools.resolve(name, { type: 'TXT', servers: ['1.1.1.1'] }))
show('resolve nope.invalid (does not exist)', await tools.resolve('nope.invalid'))
show(`reverse ${address}`, await tools.reverse(address))

console.log('\nDone. Nothing above should have thrown: a host that does not answer is a reading, not an exception.')
