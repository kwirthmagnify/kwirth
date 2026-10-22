# Email Sender (Resend)

Sender que envía mensajes por email usando la API de [Resend](https://resend.com). El cuerpo del email se formatea como HTML `<pre>` con etiqueta de nivel. No requiere servidor SMTP propio.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one. Senders are how Kwirth delivers notifications.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## Installing it

From Kwirth: **☰ → Manage extensions → Senders**, find **Email Sender (Resend)** in the marketplace and install it.
Then create one or more named configurations for it, and pick them wherever Kwirth asks for a sender.

## Cuándo usarlo

- Notificaciones críticas a equipos de operaciones o desarrollo.
- Entornos cloud donde no hay servidor SMTP disponible.
- Alternativa simple a SMTP sin gestión de credenciales de servidor.

## Requisitos

- Cuenta en [resend.com](https://resend.com) con una API key generada.
- Dominio verificado en Resend si se quiere usar una dirección `from` propia (si no, usa `kwirth@resend.dev`).

## Configuración

| Campo     | Tipo                    | Requerido | Por defecto          | Descripción                                               |
|-----------|-------------------------|-----------|----------------------|-----------------------------------------------------------|
| `name`    | `string`                | Sí        | —                    | Nombre de esta config                                     |
| `apiKey`  | `string`                | Sí        | —                    | API key de Resend                                         |
| `from`    | `string`                | No        | `kwirth@resend.dev`  | Dirección de remitente                                    |
| `to`      | `string \| string[]`    | Sí        | —                    | Destinatario(s) por defecto                               |
| `subject` | `string`                | No        | `(no subject)`       | Asunto por defecto si `ISenderMessage.subject` está vacío |

## Prioridad de campos en el mensaje

`message.to` tiene prioridad sobre `config.to`. `message.subject` tiene prioridad sobre `config.subject`.

## Ejemplos

### Config básica

```json
{
  "name": "ops-email",
  "apiKey": "re_xxxxxxxxxxxx",
  "to": "ops-team@empresa.com",
  "subject": "[Kwirth] Alerta de infraestructura"
}
```

### Múltiples destinatarios y remitente propio

```json
{
  "name": "critical-alerts",
  "apiKey": "re_xxxxxxxxxxxx",
  "from": "kwirth@midominio.com",
  "to": ["ops@empresa.com", "cto@empresa.com"],
  "subject": "[CRÍTICO] Alerta Kwirth"
}
```

### Envío con destinatario dinámico

```ts
senderAccess.send('email', 'ops-email', {
  level: 'error',
  subject: 'CrashLoopBackOff detectado',
  body: 'El pod nginx-7d4f lleva 5 reinicios en el último minuto',
  to: 'oncall@empresa.com'   // sobreescribe config.to
})
```

## Notas

- El cuerpo del email se envía siempre como HTML con `<pre style="font-family:monospace">`.
- Si Resend devuelve error, el sender lanza una excepción con el mensaje original de la API.
