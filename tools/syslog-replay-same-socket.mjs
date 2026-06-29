#!/usr/bin/env node
/**
 * syslog-replay-same-socket.mjs
 * Like syslog-replay.mjs but:
 *   - Single reused UDP socket (no create/destroy per message)
 *   - Streaming: parses and sends without loading the file into memory
 *
 * Usage: node syslog-replay-same-socket.mjs <tcpdump-file> <host>:<port> [--speed <n>] [--dry-run]
 */

import fs from 'fs'
import readline from 'readline'
import dgram from 'dgram'

const args = process.argv.slice(2)

function argValue(flag) {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
}

const filePath = args[0]
const dryRun   = args.includes('--dry-run')
const speed    = parseFloat(argValue('--speed') ?? '1.0')

let host = args[1] ?? ''
let port = 514

if (host.includes(':')) {
    const [h, p] = host.split(':')
    host = h
    port = parseInt(p, 10)
} else if (args[2] && /^\d+$/.test(args[2])) {
    port = parseInt(args[2], 10)
}

if (!filePath) {
    console.error('Usage: node syslog-replay-same-socket.mjs <tcpdump-file> <host>[:<port>] [--speed <n>] [--dry-run]')
    process.exit(1)
}
if (!dryRun && !host) {
    console.error('Missing destination host.')
    process.exit(1)
}

const RE_TS = /^(\d{2}):(\d{2}):(\d{2})\.(\d+)\s/

function tsToMs(h, m, s, frac) {
    const us = frac.padEnd(6, '0').slice(0, 6)
    return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000
        + Math.round(parseInt(us) / 1000)
}

// Streaming parser: calls onEntry for each message as it's found, awaits it before continuing
async function parseTcpdump(filePath, onEntry) {
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    })

    let baseMs      = null
    let currentMs   = null
    let accumulator = ''

    async function flush() {
        if (!accumulator) return
        const idx = accumulator.indexOf('<')
        if (idx !== -1) {
            const payload = accumulator.slice(idx).trim()
            if (payload) await onEntry({ offsetMs: currentMs - baseMs, payload })
        }
        accumulator = ''
    }

    for await (const line of rl) {
        const tsMatch = RE_TS.exec(line)
        if (tsMatch) {
            await flush()
            const ms = tsToMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4])
            currentMs = ms
            if (baseMs === null) baseMs = ms
        } else if (currentMs !== null) {
            accumulator += line
        }
    }
    await flush()
}

if (!dryRun) {
    console.log(`Sending to UDP ${host}:${port}  speed=${speed === 0 ? '∞' : speed + 'x'}  (streaming)`)
    console.log()
}

const sock = dryRun ? null : dgram.createSocket('udp4')
if (sock) sock.bind(() => {})

let sent      = 0
let startWall = null

await parseTcpdump(filePath, async ({ offsetMs, payload }) => {
    if (startWall === null) startWall = Date.now()

    if (dryRun) {
        const preview = payload.length > 140 ? payload.slice(0, 140) + '…' : payload
        console.log(`[+${offsetMs}ms] ${preview}`)
        return
    }

    if (speed > 0) {
        const targetWall = startWall + Math.round(offsetMs / speed)
        const delay = targetWall - Date.now()
        if (delay > 0) await new Promise(r => setTimeout(r, delay))
    }

    const buf = Buffer.from(payload, 'utf8')
    sock.send(buf, 0, buf.length, port, host)
    sent++
    process.stdout.write(`\r  Sent ${sent}  (+${offsetMs}ms)   `)
})

if (!dryRun) {
    process.stdout.write('\n')
    console.log(`Done. ${sent} messages sent.`)
    await new Promise(r => setTimeout(r, 500))
    sock.close()
}
