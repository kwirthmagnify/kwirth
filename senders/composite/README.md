# Composite Sender

Sender que define un flujo de enrutamiento completo como un árbol inline en un único config. Combina la lógica de `tee` (fan-out) y `regex` (enrutamiento condicional) sin necesidad de registrar configs intermedias por separado. Las hojas del árbol son referencias (`ref`) a senders reales ya registrados.

## Cuándo usarlo

- Definir pipelines completos en un único lugar, sin tener que crear configs de tee y regex por separado.
- Centralizar toda la lógica de enrutamiento de un servicio en un solo config.
- Casos complejos: filtrar por entorno → decidir nivel → enviar a múltiples destinos.

## Tipos de nodos

### `tee` — fan-out en paralelo

Envía el mensaje a todos sus hijos simultáneamente (`Promise.all`).

```json
{
  "type": "tee",
  "targets": [ <nodo>, <nodo>, ... ]
}
```

### `regex` — enrutamiento condicional

Evalúa las reglas en orden; la primera que hace match ejecuta su acción. Si ninguna hace match, se aplica `defaultAction`.

```json
{
  "type": "regex",
  "rules": [
    {
      "regex": "<patrón>",
      "flags": "i",
      "field": "subject",
      "action": "send",
      "target": <nodo>
    },
    {
      "regex": "<patrón>",
      "action": "drop"
    }
  ],
  "defaultAction": "drop",
  "defaultTarget": <nodo>
}
```

| Campo           | Tipo                                      | Por defecto | Descripción                              |
|-----------------|-------------------------------------------|-------------|------------------------------------------|
| `regex`         | `string`                                  | —           | Expresión regular                        |
| `flags`         | `string`                                  | `'i'`       | Flags de la regex                        |
| `field`         | `'subject' \| 'body' \| 'level' \| 'to'` | `'subject'` | Campo del mensaje a evaluar              |
| `action`        | `'send' \| 'drop'`                        | —           | Acción si hay match                      |
| `target`        | `ICompositeNode`                          | —           | Nodo destino (solo si `action === 'send'`)|
| `defaultAction` | `'send' \| 'drop'`                        | `'drop'`    | Acción si ninguna regla hace match       |
| `defaultTarget` | `ICompositeNode`                          | —           | Nodo destino del default                 |

### `ref` — hoja, sender registrado

Delega en un sender+config ya registrado en el sistema.

```json
{
  "type": "ref",
  "senderId": "email",
  "configName": "ops-email"
}
```

## Ejemplos

### Filtro por entorno con fan-out en producción

- `[DEV]` → se descarta
- `[QA]` → solo consola
- `[PRO]` → consola + email en paralelo
- Sin match → descartado

```json
{
  "name": "env-pipeline",
  "flow": {
    "type": "regex",
    "rules": [
      {
        "regex": "\\[DEV\\]",
        "action": "drop"
      },
      {
        "regex": "\\[QA\\]",
        "action": "send",
        "target": { "type": "ref", "senderId": "console", "configName": "qa-console" }
      },
      {
        "regex": "\\[PRO\\]",
        "action": "send",
        "target": {
          "type": "tee",
          "targets": [
            { "type": "ref", "senderId": "console",    "configName": "prod-console" },
            { "type": "ref", "senderId": "email",      "configName": "prod-email"   }
          ]
        }
      }
    ],
    "defaultAction": "drop"
  }
}
```

### Pipeline multinivel: entorno → nivel → destino

- `[PRO]` + nivel `error` → email urgente + fichero
- `[PRO]` + otros niveles → solo fichero
- `[QA]` → consola
- `[DEV]` → descartado

```json
{
  "name": "full-pipeline",
  "flow": {
    "type": "regex",
    "rules": [
      { "regex": "\\[DEV\\]", "action": "drop" },
      {
        "regex": "\\[QA\\]",
        "action": "send",
        "target": { "type": "ref", "senderId": "console", "configName": "qa-console" }
      },
      {
        "regex": "\\[PRO\\]",
        "action": "send",
        "target": {
          "type": "regex",
          "field": "level",
          "rules": [
            {
              "regex": "^error$",
              "action": "send",
              "target": {
                "type": "tee",
                "targets": [
                  { "type": "ref", "senderId": "email", "configName": "prod-email" },
                  { "type": "ref", "senderId": "file",  "configName": "prod-log"   }
                ]
              }
            }
          ],
          "defaultAction": "send",
          "defaultTarget": { "type": "ref", "senderId": "file", "configName": "prod-log" }
        }
      }
    ],
    "defaultAction": "drop"
  }
}
```

## Notas

- Los nodos `ref` delegan en `ISenderAccess` — el sender destino debe estar registrado en el sistema.
- Los nodos `tee` ejecutan todos sus hijos en paralelo (`Promise.all`). Si un hijo falla, el error se propaga.
- Los nodos `regex` dentro del flujo usan el mismo campo `field` que `sender-regex`, con los mismos defaults (`field: 'subject'`, `flags: 'i'`).
- El árbol puede tener la profundidad que sea necesaria; no hay límite de anidamiento.
