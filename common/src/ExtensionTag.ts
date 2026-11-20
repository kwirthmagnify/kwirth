/*
    What an extension is FOR (plan: plans/extension-taxonomy/PRD.md).

    The extension TYPE says how it is built (plugin, provider, sender…); the tags say what it serves:
    the `log` plugin, the `metrics` provider and the `datadog` sender are three types and all three serve
    observability. An extension carries as many as apply — agora is ai, operations, observability, sre,
    devops and kubernetes at once.

    🔴 A CLOSED catalogue. It is the only place a tag exists: what is not here is not a tag, so `log` and
    `logs` cannot both appear. Adding one means adding it here and publishing common.

    Two assignment rules (D5): every extension that uses AI carries `ai`, and every extension that does
    things in Kubernetes carries `kubernetes`.
*/
export enum EExtensionTag {
    AI = 'ai',
    ALERT = 'alert',
    ARCADE = 'arcade',
    ASSISTANT = 'assistant',
    AUTOMATION = 'automation',
    AVIATION = 'aviation',
    CHAT = 'chat',
    CLOUD = 'cloud',
    COLLABORATION = 'collaboration',
    COMPLIANCE = 'compliance',
    CYBER = 'cyber',
    DASHBOARD = 'dashboard',
    DEBUG = 'debug',
    DEVELOPMENT = 'development',
    DEVOPS = 'devops',
    EMULATOR = 'emulator',
    EVENTS = 'events',
    GAME = 'game',
    GITOPS = 'gitops',
    HEALTH = 'health',
    HOMEPAGE = 'homepage',
    IDENTITY = 'identity',
    INCIDENTS = 'incidents',
    INGEST = 'ingest',
    INTEGRATION = 'integration',
    KUBERNETES = 'kubernetes',
    LIBRARY = 'library',
    LIVE_DATA = 'live-data',
    LLM = 'llm',
    LOG = 'log',
    LOGIN = 'login',
    MEDIA = 'media',
    METRICS = 'metrics',
    MUSIC = 'music',
    NETWORKING = 'networking',
    NEWS = 'news',
    NOTIFICATIONS = 'notifications',
    OBSERVABILITY = 'observability',
    OPERATIONS = 'operations',
    PLATFORM = 'platform',
    ROUTING = 'routing',
    SAMPLE = 'sample',
    SECURITY = 'security',
    SETUP = 'setup',
    SOURCE = 'source',
    SRE = 'sre',
    STORAGE = 'storage',
    THEME = 'theme',
    TICKETING = 'ticketing',
    TOPOLOGY = 'topology',
    TRACES = 'traces',
    TRAFFIC = 'traffic',
    UI = 'ui',
    VM = 'vm',
    VULNERABILITIES = 'vulnerabilities'
}

const CATALOG: ReadonlySet<string> = new Set<string>(Object.keys(EExtensionTag).map(k => EExtensionTag[k as keyof typeof EExtensionTag]))

/** Whether a value is a tag of the catalogue. */
export const isExtensionTag = (value: unknown): value is EExtensionTag => typeof value === 'string' && CATALOG.has(value)

/**
 * The tags of an extension, read from wherever they come: its package.json or a manifest entry.
 *
 * Both arrive from OUTSIDE — a third party's marketplace, an old package — so it is read as unknown and
 * never throws: whatever is not a catalogue tag is dropped, repeats are dropped, and anything that is not
 * a list is no tags at all. An extension published before tags existed simply has none.
 */
export const extensionTagsOf = (raw: unknown): EExtensionTag[] => {
    if (!Array.isArray(raw)) return []
    const result: EExtensionTag[] = []
    for (const value of raw) {
        if (isExtensionTag(value) && result.indexOf(value) < 0) result.push(value)
    }
    return result
}
