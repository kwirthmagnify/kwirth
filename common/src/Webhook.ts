// The WEBHOOK extension type: inbound HTTP ingestion, the inbound counterpart of senders (which are
// outbound). A webhook artifact knows how to verify and parse a provider's callbacks (Jira, ServiceNow,
// GitHub…) and delivers a NORMALISED event to a consumer (a channel/plugin).
// Addressing: {host}{envRootPath}/webhook/<provider>/<opaque-token>. See plans/webhook-extension/PLAN.md.

// Normalised event a webhook delivers to its consumer. Provider-agnostic.
export interface IWebhookEvent {
    provider: string                          // id of the webhook that produced it, e.g. 'jira'
    configName: string                        // the concrete config (instance) that received the callback (the URL token resolves it)
    kind: string                              // normalised type, e.g. 'issue.updated' | 'issue.transitioned'
    externalId: string                        // id of the entity at the provider, e.g. the issue key 'SEC-42'
    status?: string                           // normalised status where applicable, e.g. 'Done'
    receivedAt: string                        // ISO
    headers?: Record<string, string>
    raw: unknown                              // the original parsed payload (for the consumer's specific needs)
}

// Config of a webhook instance. The fields are defined by EACH webhook type through getConfigSchema()
// (apiKey, HMAC secret…). It carries NO `target`: delivery goes by SUBSCRIPTION (a provider-like model) —
// the consumer subscribes to the webhook by its id and receives its events; whoever does not subscribe
// receives none.
export interface IWebhookConfig {
    name: string
    [key: string]: unknown
}

export interface IWebhookStoredConfig {
    configs: IWebhookConfig[]
    [key: string]: unknown
}

// Event consumer: implemented by the destination channel/plugin and registered through IWebhookAccess.
export interface IWebhookConsumer {
    processWebhookEvent(event: IWebhookEvent): void
}

// Handle the core injects into consumers (the counterpart of ISenderAccess). A provider-like model: a
// consumer SUBSCRIBES to a concrete CONFIG of a webhook (the pair webhookId+configName); the core hands
// it only the events of THAT config, already verified and parsed. Whoever does not subscribe gets
// nothing. The subscription is by strict pair (not by type): webhooks are general to Kwirth and there
// may be several configs/consumers of the same type → each consumer pins exactly the instance that is
// its own.
export interface IWebhookAccess {
    subscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void
    unsubscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void
    listWebhooks(): Array<{ id: string; configNames: string[] }>
    getUrl(webhookId: string, configName: string): string | undefined   // URL pública completa (incluye el token)
    rotateToken(webhookId: string, configName: string): string          // nuevo token → nueva URL
}
