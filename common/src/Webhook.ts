// Tipo de extensión WEBHOOK: ingesta HTTP entrante, contraparte inbound de los senders (que son
// salientes). Un artefacto webhook sabe verificar y parsear los callbacks de un proveedor (Jira,
// ServiceNow, GitHub…) y entrega un evento NORMALIZADO a un consumidor (un channel/plugin).
// Direccionamiento: {host}{envRootPath}/webhook/<provider>/<token-opaco>. Ver plans/webhook-extension/PLAN.md.

// Evento normalizado que un webhook entrega a su consumidor. Agnóstico del proveedor.
export interface IWebhookEvent {
    provider: string                          // id del webhook que lo produjo, p.ej. 'jira'
    kind: string                              // tipo normalizado, p.ej. 'issue.updated' | 'issue.transitioned'
    externalId: string                        // id de la entidad en el proveedor, p.ej. issue key 'SEC-42'
    status?: string                           // estado normalizado si aplica, p.ej. 'Done'
    receivedAt: string                        // ISO
    headers?: Record<string, string>
    raw: unknown                              // payload original parseado (para necesidades específicas del consumidor)
}

// Config de una instancia de webhook. `target` = id del consumidor al que se entregan los eventos.
// El resto de campos los define CADA tipo de webhook vía getConfigSchema() (apiKey, secreto HMAC…).
export interface IWebhookConfig {
    name: string
    target: string
    [key: string]: unknown
}

export interface IWebhookStoredConfig {
    configs: IWebhookConfig[]
    [key: string]: unknown
}

// Consumidor de eventos: lo implementa el channel/plugin destino y se registra vía IWebhookAccess.
export interface IWebhookConsumer {
    processWebhookEvent(event: IWebhookEvent): void
}

// Handle que el core inyecta en los consumidores (contraparte de ISenderAccess). Un consumidor se
// suscribe a los eventos dirigidos a él; el core le entrega los ya verificados y parseados.
export interface IWebhookAccess {
    subscribe(target: string, consumer: IWebhookConsumer): void
    unsubscribe(target: string, consumer: IWebhookConsumer): void
    listWebhooks(): Array<{ id: string; configNames: string[] }>
    getUrl(webhookId: string, configName: string): string | undefined   // URL pública completa (incluye el token)
    rotateToken(webhookId: string, configName: string): string          // nuevo token → nueva URL
}
