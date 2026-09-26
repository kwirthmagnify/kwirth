import type { IWebhookEvent } from '@kwirthmagnify/kwirth-common-back'
import { WebhookManager } from './WebhookManager'
import { ELogComponent, logError } from './Logging'

export interface IWebhookResponse {
    status: number
    body?: unknown
}

// Processes an incoming callback with the RAW body (rawBody) already available. The flow:
//   resolve(token) → verify (the artefact's own auth) → parse → deliver to the consumer by target.
// It never throws: it always returns an HTTP status. The core does NOT know the auth — webhook.verify() decides it.
export const handleInbound = async (
    manager: WebhookManager | undefined,
    provider: string,
    token: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>
): Promise<IWebhookResponse> => {
    if (!manager) return { status: 503, body: { ok: false, error: 'webhook manager not ready' } }

    const res = manager.resolve(token)
    if (!res) return { status: 404, body: { ok: false } }
    // The token is authoritative for the routing; the <provider> segment has to match (readability + defence).
    if (provider && provider !== res.webhookId) return { status: 404, body: { ok: false } }

    const webhook = manager.getWebhook(res.webhookId)
    if (!webhook) return { status: 404, body: { ok: false } }

    let verified = false
    try {
        verified = webhook.verify(rawBody, headers, res.config)
    } catch (err) {
        logError(ELogComponent.CORE, `Webhook '${res.webhookId}' verify threw: ${err}`)
        return { status: 401, body: { ok: false } }
    }
    if (!verified) return { status: 401, body: { ok: false } }

    let parsed: Omit<IWebhookEvent, 'configName'> | null = null
    try {
        parsed = webhook.parse(rawBody, headers)
    } catch (err) {
        logError(ELogComponent.CORE, `Webhook '${res.webhookId}' parse threw: ${err}`)
        return { status: 400, body: { ok: false } }
    }
    if (!parsed) return { status: 400, body: { ok: false } }

    // The receiver stamps the `configName` (the token resolves it; the artefact does not know it).
    const event: IWebhookEvent = { ...parsed, configName: res.configName }
    // A quick ack; deliver isolates each consumer's exceptions. Delivery is by strict pair (webhookId, configName).
    manager.deliver(res.webhookId, res.configName, event)
    return { status: 200, body: { ok: true } }
}
