export type TSyslogSeverity = 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug'
export type TSyslogFacility = 'kern' | 'user' | 'mail' | 'daemon' | 'auth' | 'syslog' | 'lpr' | 'news' | 'uucp' | 'cron' | 'authpriv' | 'ftp' | 'ntp' | 'security' | 'console' | 'solaris-cron' | 'local0' | 'local1' | 'local2' | 'local3' | 'local4' | 'local5' | 'local6' | 'local7'
export type TSyslogProtocol = 'udp' | 'tcp' | 'both'
export type TTcpFraming = 'octet-counting' | 'non-transparent'

export interface ISyslogMessage {
    raw: string
    sourceIp?: string
    facility: number
    facilityName: TSyslogFacility
    severity: number
    severityName: TSyslogSeverity
    timestamp: Date
    hostname: string
    appName: string
    procId?: string
    msgId?: string
    structuredData?: Record<string, Record<string, string>>
    message: string
    rfc: '3164' | '5424'
}

export interface ISyslogRelayTarget {
    host: string
    port: number
    protocol: 'udp' | 'tcp'
}

export interface ISyslogConfig {
    port: number
    protocol: TSyslogProtocol
    tcpFraming: TTcpFraming
    relayTargets: ISyslogRelayTarget[]
    maxMessages: number
    maxParallel: number
}
