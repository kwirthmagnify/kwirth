import net from 'node:net'
import { Resolver } from 'node:dns/promises'
import { EDnsRecordType } from '../common/NetTools'
import { formatMx, formatSoa, formatSrv, formatTxt } from './dnsFormat'

/*
    The part that touches the network: a socket and a resolver. No process is ever spawned.

    It is behind an interface (`INetProbes`) for one reason: so the orchestration above it — counts,
    loss, statistics, the shape of the error — can be tested without opening anything (PRD RNF5). What
    is tested HERE is what can be tested locally and deterministically: a TCP connect against a
    loopback server of our own, and against a port nobody is listening on.
*/

/** One attempt, as a probe reports it. */
export interface IProbeOutcome {
    ok: boolean
    /** How long it took, when it answered. */
    timeMs?: number
    /** The address behind the target, when the connection got far enough to know it. */
    address?: string
    error?: string
}

/** What the orchestration needs from the outside world. Replaced wholesale in the harness. */
export interface INetProbes {
    tcp: (target: string, port: number, timeoutMs: number) => Promise<IProbeOutcome>
    resolve: (name: string, type: EDnsRecordType, servers: string[] | undefined, timeoutMs: number) => Promise<string[]>
    reverse: (address: string, servers: string[] | undefined, timeoutMs: number) => Promise<string[]>
    now: () => number
}

/*
    A TCP connect, timed until the handshake completes. Nothing is sent and nothing is read: the
    question is whether the port answers, and writing to it would be a different question.

    The time includes resolving the name, which is what a caller trying to reach a service actually
    waits for.
*/
export const tcpProbe = (target: string, port: number, timeoutMs: number): Promise<IProbeOutcome> => new Promise(resolve => {
    const started = Date.now()
    let settled = false
    const socket = net.createConnection({ host: target, port })
    const settle = (outcome: IProbeOutcome): void => {
        if (settled) return
        settled = true
        socket.destroy()
        resolve(outcome)
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => settle({ ok: true, timeMs: Date.now() - started, address: socket.remoteAddress }))
    socket.on('timeout', () => settle({ ok: false, error: `timed out after ${timeoutMs} ms` }))
    socket.on('error', (error: Error) => settle({ ok: false, error: error.message }))
})

/*
    A resolver per call.

    `tries: 1` is the point: Node's `timeout` is per TRY and it makes four by default, so without this
    a `timeoutMs` of 2000 would really be eight seconds. Caching resolvers per set of servers would be
    premature for three methods that do I/O anyway.
*/
const makeResolver = (servers: string[] | undefined, timeoutMs: number): Resolver => {
    const resolver = new Resolver({ timeout: timeoutMs, tries: 1 })
    if (servers && servers.length > 0) resolver.setServers(servers)
    return resolver
}

const dnsResolve = async (name: string, type: EDnsRecordType, servers: string[] | undefined, timeoutMs: number): Promise<string[]> => {
    const resolver = makeResolver(servers, timeoutMs)
    switch (type) {
        case EDnsRecordType.A: return resolver.resolve4(name)
        case EDnsRecordType.AAAA: return resolver.resolve6(name)
        case EDnsRecordType.CNAME: return resolver.resolveCname(name)
        case EDnsRecordType.MX: return formatMx(await resolver.resolveMx(name))
        case EDnsRecordType.NS: return resolver.resolveNs(name)
        case EDnsRecordType.PTR: return resolver.resolvePtr(name)
        case EDnsRecordType.SOA: return formatSoa(await resolver.resolveSoa(name))
        case EDnsRecordType.SRV: return formatSrv(await resolver.resolveSrv(name))
        case EDnsRecordType.TXT: return formatTxt(await resolver.resolveTxt(name))
    }
}

const dnsReverse = (address: string, servers: string[] | undefined, timeoutMs: number): Promise<string[]> =>
    makeResolver(servers, timeoutMs).reverse(address)

/** The real probes, the ones the DCE's factory wires in. */
export const systemProbes: INetProbes = {
    tcp: tcpProbe,
    resolve: dnsResolve,
    reverse: dnsReverse,
    now: () => Date.now()
}
