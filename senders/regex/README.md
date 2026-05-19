# Regex Sender

Sender de enrutamiento condicional basado en expresiones regulares. Evalúa las reglas en orden y, en cuanto una hace match, ejecuta su acción (`send` al sender destino o `drop` para descartar). Si ninguna regla hace match, se aplica la acción por defecto.

No realiza ningún envío final; es un nodo intermedio de pipeline.

## Cuándo usarlo

- Filtrar mensajes de entornos (`DEV`, `QA`, `PRO`) hacia destinos distintos.
- Descartar ruido (debug, mensajes de prueba) antes de enviar alertas reales.
- Enrutar por nivel (`error` → email urgente, `info` → fichero de log).
- Combinado con `sender-tee` para pipelines complejos.

## Cómo funciona

1. Se evalúan las `rules` en orden; **la primera que hace match gana**.
2. Si la acción es `send`, el mensaje se reenvía al `senderId`/`configName` indicados.
3. Si la acción es `drop`, el mensaje se descarta silenciosamente.
4. Si **ninguna regla** hace match, se aplica `defaultAction` (por defecto `drop`).

## Configuración

### Config principal

| Campo                | Tipo                  | Requerido | Por defecto | Descripción                                              |
|----------------------|-----------------------|-----------|-------------|----------------------------------------------------------|
| `name`               | `string`              | Sí        | —           | Nombre de esta config                                    |
| `rules`              | `IRegexSenderRule[]`  | Sí        | `[]`        | Lista de reglas ordenadas                                |
| `defaultAction`      | `'send' \| 'drop'`    | No        | `'drop'`    | Qué hacer si ninguna regla hace match                    |
| `defaultSenderId`    | `string`              | No        | —           | Sender destino cuando `defaultAction === 'send'`         |
| `defaultConfigName`  | `string`              | No        | —           | Config destino cuando `defaultAction === 'send'`         |

### Estructura de una regla (`IRegexSenderRule`)

| Campo        | Tipo                                      | Requerido | Por defecto | Descripción                                          |
|--------------|-------------------------------------------|-----------|-------------|------------------------------------------------------|
| `regex`      | `string`                                  | Sí        | —           | Expresión regular a evaluar                          |
| `flags`      | `string`                                  | No        | `'i'`       | Flags de la regex (`i`, `g`, `m`, `s`…)              |
| `field`      | `'subject' \| 'body' \| 'level' \| 'to'` | No        | `'subject'` | Campo del mensaje sobre el que se evalúa la regex    |
| `action`     | `'send' \| 'drop'`                        | Sí        | —           | Acción a ejecutar si la regex hace match             |
| `senderId`   | `string`                                  | No*       | —           | Sender destino (requerido si `action === 'send'`)    |
| `configName` | `string`                                  | No*       | —           | Config destino (requerido si `action === 'send'`)    |

## Ejemplos

### Filtro por entorno en el asunto

Escenario: mensajes con `[DEV]` se descartan, `[QA]` van solo a consola, `[PRO]` van a email.

```json
{
  "name": "env-router",
  "rules": [
    {
      "regex": "\\[DEV\\]",
      "field": "subject",
      "action": "drop"
    },
    {
      "regex": "\\[QA\\]",
      "field": "subject",
      "action": "send",
      "senderId": "console",
      "configName": "qa-console"
    },
    {
      "regex": "\\[PRO\\]",
      "field": "subject",
      "action": "send",
      "senderId": "email",
      "configName": "prod-email"
    }
  ],
  "defaultAction": "drop"
}
```

### Enrutamiento por nivel

Errores van a email, el resto a fichero.

```json
{
  "name": "level-router",
  "rules": [
    {
      "regex": "^error$",
      "field": "level",
      "flags": "i",
      "action": "send",
      "senderId": "email",
      "configName": "ops-email"
    }
  ],
  "defaultAction": "send",
  "defaultSenderId": "file",
  "defaultConfigName": "general-log"
}
```

### Descarte de mensajes de prueba en el body

```json
{
  "name": "no-test-messages",
  "rules": [
    {
      "regex": "test|prueba|dummy",
      "field": "body",
      "flags": "i",
      "action": "drop"
    }
  ],
  "defaultAction": "send",
  "defaultSenderId": "console",
  "defaultConfigName": "default"
}
```

### Pipeline con tee

```
regex-router
  ├─ match [PRO] → tee-prod → console + email
  └─ match [QA]  → file
```

```json
{
  "name": "full-router",
  "rules": [
    { "regex": "\\[PRO\\]", "field": "subject", "action": "send", "senderId": "tee",  "configName": "tee-prod" },
    { "regex": "\\[QA\\]",  "field": "subject", "action": "send", "senderId": "file", "configName": "qa-log" }
  ],
  "defaultAction": "drop"
}
```

## Notas

- Las reglas se evalúan en orden; **solo se ejecuta la primera que hace match**.
- El flag por defecto es `i` (case-insensitive). Para match exacto sensible a mayúsculas, pasa `flags: ""`.
- Si `action === 'send'` pero `senderId` o `configName` están vacíos, el mensaje se descarta sin error.
- Para aplicar varias acciones al mismo mensaje (fan-out condicional), encadena este sender con un `sender-tee`.
