## reglas de coding

  - nunca uses ficheros js como origen, el codigo del proyecto está todo en la carpeta src de cada proyecto, y es typescript
  - trata de evitar los tipos 'any' si existen tipos disponibles. Si quieres crear un tipo nuevo avisame para que yo lo valide.
  - trata de utilizar las estrcuturas y librerias existentes para determinadas funciones comunes, como acceso al kubernetes. En general, siempre suele haber un fichero tools o utils con funciones comunes a utilizar.

## Campos de secreto (contraseñas, tokens, client secrets)

Los secretos se manejan **como cualquier otro dato**: el back los devuelve REALES en el `GET` de su
configuración (recompuestos desde el Secret), el diálogo pre-rellena el campo con ese valor, y la única
diferencia es que en la UI se muestran enmascarados con `type='password'` + **toggle de ojo**
(`Visibility`/`VisibilityOff` en el `endAdornment`).

⛔ **PROHIBIDO**: devolver `hasPassword`/`hasSecret` en vez del valor, redactar la vista que se manda al
front, y el merge "campo vacío = no lo cambies" en el back. Se persiste lo que llega.

Referencia viva: `providers/http-pull-push/src/back/index.ts` (`GET /configs` devuelve
`[...this.configs.values()]` con las credenciales dentro). Documentado y validado por e2e en
`plans/completed/http-pull-push/PLAN.md`.
