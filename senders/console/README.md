# Console Sender

Sender que escribe los mensajes directamente en la salida estándar del proceso Node.js. Colorea las líneas según el nivel del mensaje usando códigos ANSI y permite configurar prefijo, timestamps y etiquetas de nivel por config.

## Cuándo usarlo

- Desarrollo local: ver alertas en el terminal donde corre Kwirth.
- Diagnóstico rápido sin necesidad de infraestructura adicional.
- Combinado con `sender-tee` para tener salida a consola y a otro destino a la vez.

## Configuración

| Campo        | Tipo      | Requerido | Por defecto | Descripción                                      |
|--------------|-----------|-----------|-------------|--------------------------------------------------|
| `name`       | `string`  | Sí        | —           | Nombre de esta config                            |
| `prefix`     | `string`  | No        | —           | Texto que se antepone a cada línea, ej. `[APP]`  |
| `timestamps` | `boolean` | No        | `true`      | Incluir timestamp ISO en cada línea              |
| `levels`     | `boolean` | No        | `true`      | Incluir etiqueta de nivel `[INFO]`, `[ERROR]`…   |

## Colores por nivel

| Nivel     | Color    |
|-----------|----------|
| `debug`   | Cian     |
| `info`    | Verde    |
| `warning` | Amarillo |
| `error`   | Rojo     |

## Ejemplos

### Config mínima

```json
{
  "name": "default"
}
```

Salida:
```
[2024-01-15T10:30:00.000Z] [INFO] Pod nginx started
```

### Con prefijo y sin timestamps

```json
{
  "name": "app-alerts",
  "prefix": "[KWIRTH]",
  "timestamps": false
}
```

Salida:
```
[KWIRTH] [ERROR] CrashLoopBackOff detected on pod api-7f9d
```

### Config silenciosa (solo el body)

```json
{
  "name": "clean",
  "timestamps": false,
  "levels": false
}
```

Salida:
```
CrashLoopBackOff detected on pod api-7f9d
```

## Notas

- Los mensajes de nivel `error` se envían a `console.error` (stderr); `warning` a `console.warn`; el resto a `console.log`.
- `message.to` se añade al final de la línea como `→ destinatario` si está presente.
