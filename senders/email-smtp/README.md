# Email Sender (SMTP)

Sender que envía mensajes por email usando un servidor SMTP estándar vía [Nodemailer](https://nodemailer.com). Soporta TLS, STARTTLS y texto plano, con o sin autenticación.

## Cuándo usarlo

- Entornos corporativos con servidor SMTP interno.
- Cuando se necesita control total sobre el servidor de correo saliente.
- Alternativa a Resend cuando no se quiere depender de una API externa.

## Configuración

| Campo        | Tipo                            | Requerido | Descripción                                               |
|--------------|---------------------------------|-----------|-----------------------------------------------------------|
| `name`       | `string`                        | Sí        | Nombre de esta config                                     |
| `host`       | `string`                        | Sí        | Hostname o IP del servidor SMTP                           |
| `port`       | `number`                        | Sí        | Puerto SMTP                                               |
| `encryption` | `'tls' \| 'starttls' \| 'plain'`| Sí        | Modo de cifrado (ver tabla abajo)                         |
| `user`       | `string`                        | No        | Usuario SMTP (omitir para relays sin auth)                |
| `pass`       | `string`                        | No        | Contraseña SMTP (omitir para relays sin auth)             |
| `from`       | `string`                        | Sí        | Dirección de remitente                                    |
| `to`         | `string \| string[]`            | Sí        | Destinatario(s) por defecto                               |
| `subject`    | `string`                        | No        | Asunto por defecto si `ISenderMessage.subject` está vacío |

## Modos de cifrado

| Valor       | Puerto típico | Comportamiento                        |
|-------------|---------------|---------------------------------------|
| `tls`       | 465           | SMTPS — conexión cifrada desde inicio |
| `starttls`  | 587           | STARTTLS — negocia cifrado al conectar|
| `plain`     | 25            | Sin cifrado — solo para redes internas|

## Prioridad de campos en el mensaje

`message.to` tiene prioridad sobre `config.to`. `message.subject` tiene prioridad sobre `config.subject`.

## Ejemplos

### Gmail con STARTTLS

```json
{
  "name": "gmail",
  "host": "smtp.gmail.com",
  "port": 587,
  "encryption": "starttls",
  "user": "miusuario@gmail.com",
  "pass": "app-password-aqui",
  "from": "miusuario@gmail.com",
  "to": "ops@empresa.com"
}
```

### Relay interno sin autenticación

```json
{
  "name": "internal-relay",
  "host": "mail.corp.local",
  "port": 25,
  "encryption": "plain",
  "from": "kwirth@corp.local",
  "to": "alerts@corp.local"
}
```

### Servidor con TLS en puerto 465

```json
{
  "name": "secure-smtp",
  "host": "smtp.empresa.com",
  "port": 465,
  "encryption": "tls",
  "user": "kwirth@empresa.com",
  "pass": "s3cr3t",
  "from": "kwirth@empresa.com",
  "to": ["ops@empresa.com", "noc@empresa.com"],
  "subject": "[Kwirth] Alerta"
}
```

## Notas

- El transporter Nodemailer se crea una vez al registrar la config y se reutiliza en todos los envíos.
- Al eliminar una config (`removeConfig`), el transporter se cierra limpiamente.
- El cuerpo del email se envía como HTML con `<pre style="font-family:monospace">` incluyendo la etiqueta de nivel.
- En `stopSender()` se cierran todos los transporters activos.
