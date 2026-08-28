import type { IWebhookEvent } from '@kwirthmagnify/kwirth-common-back'
import { WebhookManager } from './WebhookManager'
import { ELogComponent, logError } from './Logging'

export interface IWebhookResponse {
    status: number
    body?: unknown
}

// Procesa un callback entrante con el cuerpo CRUDO (rawBody) ya disponible. Flujo:
//   resolve(token) → verify (auth propia del artefacto) → parse → deliver al consumidor por target.
// No lanza: siempre devuelve un status HTTP. La auth NO la conoce el core — la decide el webhook.verify().
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
    // El token es autoritativo para el enrutado; el segmento <provider> debe coincidir (legibilidad + defensa).
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

    let event: IWebhookEvent | null = null
    try {
        event = webhook.parse(rawBody, headers)
    } catch (err) {
        logError(ELogComponent.CORE, `Webhook '${res.webhookId}' parse threw: ${err}`)
        return { status: 400, body: { ok: false } }
    }
    if (!event) return { status: 400, body: { ok: false } }

    // Ack rápido; deliver aísla las excepciones de cada consumidor.
    manager.deliver(res.webhookId, event)
    return { status: 200, body: { ok: true } }
}
