#!/usr/bin/env node
/**
 * syslog-replay.mjs
 * Replays syslog messages extracted from a tcpdump -A capture file,
 * preserving the original inter-packet timing.
 *
 * Usage:
 *   node tools/syslog-replay.mjs <tcpdump-file> <host>[:<port>] [port] [options]
 *
 * Options:
 *   --speed <factor>      Time multiplier (default 1.0). Use 0 to send all at once.
 *   --protocol <udp|tcp>  Transport (default udp)
 *   --dry-run             Parse and print messages without sending
 *
 * Examples:
 *   node tools/syslog-replay.mjs capture.txt 127.0.0.1 9001
 *   node tools/syslog-replay.mjs capture.txt 127.0.0.1:9001
 *   node tools/syslog-replay.mjs capture.txt 127.0.0.1 514 --speed 10
 *   node tools/syslog-replay.mjs capture.txt 127.0.0.1:9001 --dry-run
 */

import fs from 'fs'
import readline from 'readline'
import dgram from 'dgram'
import net from 'net'

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function argValue(flag) {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
}

const filePath = args[0]
const dryRun   = args.includes('--dry-run')
const speed    = parseFloat(argValue('--speed') ?? '1.0')
const protocol = (argValue('--protocol') ?? 'udp').toLowerCase()

// Accept both "host:port" and "host port" forms
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
    console.error('Usage: node syslog-replay.mjs <tcpdump-file> <host>[:<port>] [port] [--speed <n>] [--protocol udp|tcp] [--dry-run]')
    process.exit(1)
}
if (!dryRun && !host) {
    console.error('Missing destination host.')
    process.exit(1)
}

// ── Stream parser ─────────────────────────────────────────────────────────────

// tcpdump timestamp line: HH:MM:SS.ffffff [...]
const RE_TS = /^(\d{2}):(\d{2}):(\d{2})\.(\d+)\s/

function tsToMs(h, m, s, frac) {
    const us = frac.padEnd(6, '0').slice(0, 6)
    return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000
        + Math.round(parseInt(us) / 1000)
}

/**
 * Parse a tcpdump -A file via readline (line by line, no full-file buffer).
 * Calls onEntry({ offsetMs, payload }) for each syslog message found.
 */
async function parseTcpdump(filePath, onEntry) {
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    })

    let baseMs    = null
    let currentMs = null
    let accumulator = ''

    function flush() {
        if (!accumulator) return
        const idx = accumulator.indexOf('<')
        if (idx !== -1) {
            const payload = accumulator.slice(idx).trim()
            if (payload) onEntry({ offsetMs: currentMs - baseMs, payload })
        }
        accumulator = ''
    }

    for await (const line of rl) {
        const tsMatch = RE_TS.exec(line)
        if (tsMatch) {
            flush()
            const ms = tsToMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4])
            currentMs = ms
            if (baseMs === null) baseMs = ms
        } else if (currentMs !== null) {
            accumulator += line
        }
    }
    flush()
}

// ── Sender ────────────────────────────────────────────────────────────────────

async function sendUdp(payload, host, port) {
    return new Promise((resolve, reject) => {
        const sock = dgram.createSocket('udp4')
        const buf = Buffer.from(payload, 'utf8')
        sock.send(buf, 0, buf.length, port, host, (err) => {
            sock.close()
            if (err) reject(err)
            else resolve()
        })
    })
}

let tcpSocket = null

async function sendTcp(payload, host, port) {
    if (!tcpSocket || tcpSocket.destroyed) {
        await new Promise((resolve, reject) => {
            tcpSocket = net.createConnection({ host, port }, resolve)
            tcpSocket.once('error', reject)
        })
    }
    return new Promise((resolve, reject) => {
        tcpSocket.write(payload + '\n', 'utf8', (err) => err ? reject(err) : resolve())
    })
}

async function send(payload) {
    if (protocol === 'tcp') return sendTcp(payload, host, port)
    return sendUdp(payload, host, port)
}

// ── Main ──────────────────────────────────────────────────────────────────────

// First pass: collect all entries (needed to know total count)
// For huge files we could stream-and-send directly, but collecting allows
// accurate progress display. If memory is tight, switch to direct streaming.
console.log(`Reading ${filePath} …`)
const entries = []
await parseTcpdump(filePath, e => entries.push(e))

if (entries.length === 0) {
    console.error('No syslog messages found in the capture file.')
    process.exit(1)
}

console.log(`Parsed ${entries.length} messages.`)
if (dryRun) {
    for (const { offsetMs, payload } of entries) {
        const preview = payload.length > 140 ? payload.slice(0, 140) + '…' : payload
        console.log(`[+${offsetMs}ms] ${preview}`)
    }
    process.exit(0)
}

console.log(`Sending to ${protocol.toUpperCase()} ${host}:${port}  speed=${speed === 0 ? '∞' : speed + 'x'}`)
console.log()

let sent = 0
const startWall = Date.now()

for (const { offsetMs, payload } of entries) {
    if (speed > 0) {
        const targetWall = startWall + Math.round(offsetMs / speed)
        const delay = targetWall - Date.now()
        if (delay > 0) await new Promise(r => setTimeout(r, delay))
    }

    try {
        await send(payload)
        sent++
        process.stdout.write(`\r  Sent ${sent}/${entries.length}  (+${offsetMs}ms)   `)
    } catch (err) {
        console.error(`\nFailed at message ${sent + 1}: ${err.message}`)
    }
}

process.stdout.write('\n')
console.log(`Done. ${sent} messages sent.`)
if (tcpSocket && !tcpSocket.destroyed) tcpSocket.destroy()
