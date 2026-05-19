# Tee Sender

Sender intermedio que recibe un mensaje y lo reenvía en paralelo a múltiples senders de destino configurados, sin hacer ningún envío final él mismo. Funciona como el comando Unix `tee`: lo que entra, sale por todos los canales a la vez.

## Cuándo usarlo

- Enviar la misma alerta simultáneamente a consola y a fichero.
- Construir pipelines de notificación: un único punto de entrada que abanica hacia varios destinos.
- Encadenar tees para topologías más complejas (un tee apuntando a otro tee).

## Configuración

Cada config tiene un campo `targets`: lista de pares `(senderId, configName)` que identifican el sender y la config de destino.

| Campo     | Tipo                              | Requerido | Descripción                                    |
|-----------|-----------------------------------|-----------|------------------------------------------------|
| `name`    | `string`                          | Sí        | Nombre de esta config                          |
| `targets` | `Array<{senderId, configName}>`   | Sí        | Lista de senders de destino                    |

### Estructura de un target

```json
{
  "senderId":   "console",       // id del sender destino (ej: "console", "file", "tee")
  "configName": "mi-console"     // nombre de la config ya registrada en ese sender
}
```

## Ejemplos

### Fan-out a consola y fichero

Prerequisito: tener configurados un `ConsoleSender` con config `"alerts-console"` y un `FileSender` con config `"alerts-file"`.

```json
{
  "name": "alerts-tee",
  "targets": [
    { "senderId": "console", "configName": "alerts-console" },
    { "senderId": "file",    "configName": "alerts-file" }
  ]
}
```

Invocar:
```ts
senderAccess.send('tee', 'alerts-tee', {
  level: 'error',
  subject: 'Pod crash',
  body: 'nginx-7d4f crashed in namespace prod'
})
```

El mensaje llega al mismo tiempo a stdout y al fichero de log.

### Cadena de tees

```
tee-main
  ├─ tee-ops    →  console + file
  └─ tee-biz    →  kafka + slack
```

Config `tee-main`:
```json
{
  "name": "tee-main",
  "targets": [
    { "senderId": "tee", "configName": "tee-ops" },
    { "senderId": "tee", "configName": "tee-biz" }
  ]
}
```

## Comportamiento

- Los envíos a todos los targets se hacen en **paralelo** (`Promise.all`).
- Si un target falla, el error se propaga (el `Promise.all` rechaza). Los targets completados antes del fallo **no se revierten**.
- El `ISenderAccess` se inyecta en `startSender()` — el tee no funciona antes de que el sistema lo inicialice.
