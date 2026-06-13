import { ISyslogMessage, TSyslogFacility, TSyslogSeverity } from '../types/ISyslogMessage'

const FACILITY_NAMES: string[] = [
    'kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news',
    'uucp', 'cron', 'authpriv', 'ftp', 'ntp', 'security', 'console', 'solaris-cron',
    'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7',
]
const SEVERITY_NAMES: string[] = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']

// RFC 5424: capture first 7 SP-delimited header fields + everything else
// Using ([\s\S]*) for the tail avoids any regex bracket-matching issues
const RE_5424_HDR = /^<(\d{1,3})>(\d+) (\S+) (\S+) (\S+) (\S+) (\S+) ([\s\S]*)$/

// RFC 3164: <PRI>Mmm DD HH:MM:SS HOSTNAME TAG[PID]: MSG
const RE_3164 = /^<(\d{1,3})>((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2}) (\S+) (\S+?)(?:\[(\d+)\])?: ?([\s\S]*)$/

function toFacility(n: number): TSyslogFacility {
    return (FACILITY_NAMES[n] ?? `local${n}`) as TSyslogFacility
}
function toSeverity(n: number): TSyslogSeverity {
    return (SEVERITY_NAMES[n & 7] ?? 'info') as TSyslogSeverity
}

export class SyslogParser {
    static parse(raw: string): ISyslogMessage {
        const m5424 = RE_5424_HDR.exec(raw)
        // confirm it is RFC 5424 by checking version field is a digit (not a month name)
        if (m5424 && /^\d+$/.test(m5424[2])) return SyslogParser.parse5424(raw, m5424)
        const m3164 = RE_3164.exec(raw)
        if (m3164) return SyslogParser.parse3164(raw, m3164)
        return SyslogParser.fallback(raw)
    }

    private static pri(priStr: string): { facility: number; facilityName: TSyslogFacility; severity: number; severityName: TSyslogSeverity } {
        const priv = parseInt(priStr, 10)
        const facility = priv >> 3
        const severity = priv & 0x7
        return { facility, facilityName: toFacility(facility), severity, severityName: toSeverity(severity) }
    }

    private static parse5424(raw: string, m: RegExpExecArray): ISyslogMessage {
        const { facility, facilityName, severity, severityName } = SyslogParser.pri(m[1])
        const timestamp = m[3] === '-' ? new Date() : new Date(m[3])
        const tail = m[8] ?? ''

        const sdMap: Record<string, Record<string, string>> = {}
        let message = ''

        if (!tail || tail === '-') {
            // nil STRUCTURED-DATA, no message
        } else if (tail.startsWith('- ')) {
            message = tail.slice(2)
        } else if (tail.startsWith('[')) {
            // Extract all SD blocks, falling back to CheckPoint-style if standard fails
            let cursor = tail
            while (cursor.startsWith('[')) {
                const block = SyslogParser.extractSDBlock(cursor)
                if (!block) { message = cursor; break }
                const std = SyslogParser.parseSDStandard(block.inner)
                if (Object.keys(std).length > 0) {
                    Object.assign(sdMap, std)
                } else {
                    const cp = SyslogParser.parseSDCheckpoint(block.inner)
                    if (Object.keys(cp).length > 0) sdMap['checkpoint'] = cp
                }
                cursor = block.after
            }
            if (cursor && !cursor.startsWith('[')) message = cursor
        } else {
            message = tail
        }

        return {
            raw, facility, facilityName, severity, severityName,
            timestamp,
            hostname: m[4] === '-' ? '' : m[4],
            appName:  m[5] === '-' ? '' : m[5],
            procId:   m[6] === '-' ? undefined : m[6],
            msgId:    m[7] === '-' ? undefined : m[7],
            structuredData: Object.keys(sdMap).length ? sdMap : undefined,
            message,
            rfc: '5424',
        }
    }

    private static parse3164(raw: string, m: RegExpExecArray): ISyslogMessage {
        const { facility, facilityName, severity, severityName } = SyslogParser.pri(m[1])
        const year = new Date().getFullYear()
        const timestamp = new Date(`${m[2]} ${year}`)
        return {
            raw, facility, facilityName, severity, severityName,
            timestamp,
            hostname: m[3],
            appName:  m[4],
            procId:   m[5],
            message:  m[6] ?? '',
            rfc: '3164',
        }
    }

    private static fallback(raw: string): ISyslogMessage {
        const m = /^<(\d{1,3})>/.exec(raw)
        const { facility, facilityName, severity, severityName } = SyslogParser.pri(m?.[1] ?? '0')
        return { raw, facility, facilityName, severity, severityName, timestamp: new Date(), hostname: '-', appName: '-', message: raw, rfc: '3164' }
    }

    // Extract the content of the first balanced [...] block.
    // Tracks quoted strings and backslash escapes so that \] or " inside values
    // do not prematurely terminate the block.
    private static extractSDBlock(input: string): { inner: string; after: string } | null {
        if (!input.startsWith('[')) return null
        let depth = 0
        let inQuote = false
        for (let i = 0; i < input.length; i++) {
            const ch = input[i]
            if (inQuote) {
                if (ch === '\\') { i++; continue }   // skip escaped char (\] \\ \" etc.)
                if (ch === '"') inQuote = false
                continue
            }
            if (ch === '"') { inQuote = true; continue }
            if (ch === '[') depth++
            else if (ch === ']') {
                if (--depth === 0) {
                    return { inner: input.slice(1, i), after: input.slice(i + 1).trimStart() }
                }
            }
        }
        return null  // unclosed bracket
    }

    // Standard RFC 5424 SD element: SDID key="value" key="value" ...
    // Returns {} if the inner content doesn't look like standard SD (e.g. CheckPoint format).
    private static parseSDStandard(inner: string): Record<string, Record<string, string>> {
        const m = /^(\S+)((?:\s+[^\s=]+="[^"]*")*)/.exec(inner)
        if (!m) return {}
        const sdId = m[1]
        // If the SDID contains ':' or '[' it's not a valid RFC 5424 SDID — likely CheckPoint format
        if (/[:\[\]]/.test(sdId)) return {}
        const fields: Record<string, string> = {}
        const paramRe = /([^\s=]+)="([^"]*)"/g
        let pm: RegExpExecArray | null
        while ((pm = paramRe.exec(m[2])) !== null) fields[pm[1]] = pm[2]
        return { [sdId]: fields }
    }

    // CheckPoint LEA syslog format: key:"value"; key:"value"; ...
    // Values may contain backslash-escaped characters (e.g. \] inside __policy_id_tag).
    private static parseSDCheckpoint(inner: string): Record<string, string> {
        const result: Record<string, string> = {}
        // \w matches [a-zA-Z0-9_] which covers all CheckPoint field names including __policy_id_tag
        const re = /(\w+):"((?:[^"\\]|\\.)*)"/g
        let m: RegExpExecArray | null
        while ((m = re.exec(inner)) !== null) {
            result[m[1]] = m[2].replace(/\\(.)/g, '$1')   // unescape \x → x
        }
        return result
    }
}
