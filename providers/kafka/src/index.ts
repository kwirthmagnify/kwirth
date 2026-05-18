import { Kafka, Consumer, KafkaConfig, SASLOptions, logLevel } from 'kafkajs'
import { KwirthData, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

// ─── Public config types (consumed by channels subscribing to this provider) ──

export interface IKafkaSaslConfig {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'
    username: string
    password: string
}

/**
 * Maps one Kafka topic to a space name.
 * 'types' is an optional whitelist: if the message value has a 'type' field,
 * only messages whose type is in this list are forwarded.
 */
export interface IKafkaSpaceMapping {
    topic: string
    name: string
    types?: string[]
}

/**
 * Config for one logical Kafka origin (broker set + security + topic list).
 * A subscriber can pass multiple connections to consume from different clusters simultaneously.
 */
export interface IKafkaConnectionConfig {
    brokers: string[]
    clientId?: string
    ssl?: boolean
    sasl?: IKafkaSaslConfig
    groupId?: string
    spaces: IKafkaSpaceMapping[]
}

/**
 * Full config passed by a channel when calling addSubscriber().
 * Mirrors the BusinessProvider pattern: spaces group events by logical domain.
 *
 * Example:
 *   {
 *     connections: [
 *       {
 *         brokers: ['kafka-host:9092'],
 *         ssl: true,
 *         sasl: { mechanism: 'plain', username: 'user', password: 'pass' },
 *         groupId: 'kwirth-alerts',
 *         spaces: [
 *           { topic: 'k8s-alerts',  name: 'alerts',  types: ['Critical','Warning'] },
 *           { topic: 'k8s-metrics', name: 'metrics' }
 *         ]
 *       }
 *     ]
 *   }
 */
export interface IKafkaProviderConfig {
    connections: IKafkaConnectionConfig[]
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface IConnectionEntry {
    kafka: Kafka
    groupId: string
    consumer: Consumer
    topics: Set<string>
    spaceMap: Map<string, IKafkaSpaceMapping>                           // topic -> mapping
    subscribers: Map<IProviderSubscriber, IKafkaConnectionConfig>       // subscriber -> their config for this connection
    running: boolean
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class KafkaProvider implements IProvider {
    public readonly id = 'kafka'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    // connectionKey -> entry; one entry per unique (brokers + groupId + security) combination
    private connections = new Map<string, IConnectionEntry>()

    // accumulated data store, same shape as BusinessProvider: space -> type -> messages[]
    private data = new Map<string, Map<string, any[]>>()

    constructor(_clusterInfo: any, _kwirthData: KwirthData) {}

    // ── IProvider ──────────────────────────────────────────────────────────────

    addSubscriber = async (subscriber: IProviderSubscriber, providerConfig: IKafkaProviderConfig) => {
        if (!providerConfig?.connections?.length) return

        for (const connConfig of providerConfig.connections) {
            const key = this.buildConnectionKey(connConfig)
            let entry = this.connections.get(key)

            if (!entry) {
                const kafkaCfg = this.buildKafkaConfig(connConfig)
                const kafka = new Kafka(kafkaCfg)
                const groupId = connConfig.groupId ?? 'kwirth-kafka'
                entry = {
                    kafka,
                    groupId,
                    consumer: kafka.consumer({ groupId }),
                    topics: new Set(),
                    spaceMap: new Map(),
                    subscribers: new Map(),
                    running: false,
                }
                this.connections.set(key, entry)
            }

            entry.subscribers.set(subscriber, connConfig)
            this.rebuildTopicsAndSpaces(entry)
            await this.restartConsumer(key, entry)
        }
    }

    removeSubscriber = async (subscriber: IProviderSubscriber) => {
        for (const [key, entry] of this.connections) {
            if (!entry.subscribers.has(subscriber)) continue
            entry.subscribers.delete(subscriber)

            if (entry.subscribers.size === 0) {
                await this.stopAndDisconnect(entry)
                this.connections.delete(key)
            } else {
                this.rebuildTopicsAndSpaces(entry)
                await this.restartConsumer(key, entry)
            }
        }
    }

    startProvider = async () => {}

    stopProvider = async () => {
        for (const entry of this.connections.values()) {
            await this.stopAndDisconnect(entry)
        }
        this.connections.clear()
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private buildConnectionKey(config: IKafkaConnectionConfig): string {
        return JSON.stringify({
            brokers: [...config.brokers].sort(),
            groupId: config.groupId ?? 'kwirth-kafka',
            mechanism: config.sasl?.mechanism,
            username: config.sasl?.username,
        })
    }

    private buildKafkaConfig(config: IKafkaConnectionConfig): KafkaConfig {
        const sasl: SASLOptions | undefined = config.sasl
            ? { mechanism: config.sasl.mechanism, username: config.sasl.username, password: config.sasl.password } as SASLOptions
            : undefined

        return {
            clientId: config.clientId ?? 'kwirth-kafka',
            brokers: config.brokers,
            ssl: config.ssl ?? false,
            sasl,
            logLevel: logLevel.ERROR,
        }
    }

    private rebuildTopicsAndSpaces(entry: IConnectionEntry): void {
        entry.topics.clear()
        entry.spaceMap.clear()
        for (const connConfig of entry.subscribers.values()) {
            for (const mapping of connConfig.spaces) {
                entry.topics.add(mapping.topic)
                entry.spaceMap.set(mapping.topic, mapping)
            }
        }
    }

    private async restartConsumer(key: string, entry: IConnectionEntry): Promise<void> {
        await this.stopAndDisconnect(entry)
        if (entry.topics.size === 0) return

        // Create a fresh consumer — needed after disconnect to resubscribe with a new topic list
        entry.consumer = entry.kafka.consumer({ groupId: entry.groupId })

        try {
            await entry.consumer.connect()
            await entry.consumer.subscribe({ topics: Array.from(entry.topics), fromBeginning: false })
            entry.running = true
            entry.consumer.run({
                eachMessage: async ({ topic, message }) => {
                    await this.handleMessage(entry, topic, message.value?.toString())
                }
            }).catch(err => {
                console.error(`[kafka] consumer run error (key=${key}): ${err}`)
                entry.running = false
            })
        } catch (err) {
            console.error(`[kafka] failed to start consumer (key=${key}): ${err}`)
            entry.running = false
        }
    }

    private async stopAndDisconnect(entry: IConnectionEntry): Promise<void> {
        if (!entry.running) return
        entry.running = false
        try { await entry.consumer.stop() } catch {}
        try { await entry.consumer.disconnect() } catch {}
    }

    private async handleMessage(entry: IConnectionEntry, topic: string, raw: string | undefined): Promise<void> {
        const spaceMapping = entry.spaceMap.get(topic)
        if (!spaceMapping) return

        let value: any
        try { value = raw ? JSON.parse(raw) : {} } catch { value = { raw } }

        const spaceName = spaceMapping.name
        const typeName = topic

        // Accumulate in data store
        let spaceData = this.data.get(spaceName)
        if (!spaceData) { spaceData = new Map(); this.data.set(spaceName, spaceData) }
        let typeArr = spaceData.get(typeName)
        if (!typeArr) { typeArr = []; spaceData.set(typeName, typeArr) }
        typeArr.push(value)

        const event = { space: spaceName, type: typeName, data: value }

        // Dispatch to each subscriber that has this topic in their config
        for (const [subscriber, connConfig] of entry.subscribers) {
            const mapping = connConfig.spaces.find(s => s.topic === topic)
            if (!mapping) continue

            // Apply optional type filter: if types is set, value must carry a matching 'type' field
            if (mapping.types && mapping.types.length > 0 && !mapping.types.includes(value?.type)) continue

            subscriber.processProviderEvent(this.id, {
                last: {
                    type: 'event',
                    timestamp: Date.now().toString(),
                    event,
                },
                all: this.data,
            })
        }
    }
}

export default KafkaProvider
