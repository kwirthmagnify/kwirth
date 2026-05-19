# File Sender

Sender que escribe los mensajes en un fichero de log en disco. Soporta rotación automática por número de líneas: cuando el fichero supera el límite configurado, se renombra con timestamp y se empieza uno nuevo.

## Cuándo usarlo

- Persistir alertas en disco para auditoría o revisión posterior.
- Integraciones con agentes de log externos (Filebeat, Fluentd…) que leen ficheros.
- Entornos sin acceso a infraestructura de mensajería.

## Configuración

| Campo        | Tipo      | Requerido | Por defecto | Descripción                                                    |
|--------------|-----------|-----------|-------------|----------------------------------------------------------------|
| `name`       | `string`  | Sí        | —           | Nombre de esta config                                          |
| `filePath`   | `string`  | Sí        | —           | Ruta absoluta o relativa al fichero de log                     |
| `timestamps` | `boolean` | No        | `true`      | Incluir timestamp ISO en cada línea                            |
| `levels`     | `boolean` | No        | `true`      | Incluir etiqueta de nivel `[INFO]`, `[ERROR]`…                 |
| `maxLines`   | `number`  | No        | `0`         | Rotar fichero al alcanzar este número de líneas. `0` = sin límite |

## Rotación

Cuando se alcanza `maxLines`, el fichero actual se renombra a `<filePath>.<timestamp>.bak` y se crea uno nuevo vacío. El contador de líneas se reinicia. Los ficheros `.bak` no se eliminan automáticamente.

## Ejemplos

### Config básica

```json
{
  "name": "alerts-log",
  "filePath": "/var/log/kwirth/alerts.log"
}
```

Línea escrita:
```
[2024-01-15T10:30:00.000Z] [ERROR] Pod api-7f9d crashed
```

### Con rotación cada 10 000 líneas

```json
{
  "name": "prod-log",
  "filePath": "/var/log/kwirth/prod.log",
  "maxLines": 10000
}
```

Al llegar a la línea 10 000, el fichero se archiva como `/var/log/kwirth/prod.log.1705312200000.bak` y el log continúa limpio.

### Sin timestamps ni niveles

```json
{
  "name": "raw-output",
  "filePath": "./output/events.log",
  "timestamps": false,
  "levels": false
}
```

## Notas

- Si el directorio padre de `filePath` no existe, se crea automáticamente al registrar la config.
- Si el fichero ya existía al arrancar, las líneas previas se cuentan para el cálculo de rotación.
- Las escrituras son síncronas (`appendFileSync`) para evitar pérdida de mensajes ante crash.
