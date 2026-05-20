## reglas de coding

  - nunca uses ficheros js como origen, el codigo del proyecto está todo en la carpeta src de cada proyecto, y es typescript
  - trata de evitar los tipos 'any' si existen tipos disponibles. Si quieres crear un tipo nuevo avisame para que yo lo valide.
  - trata de utilizar las estrcuturas y librerias existentes para determinadas funciones comunes, como acceso al kubernetes. En general, siempre suele haber un fichero tools o utils con funciones comunes a utilizar.

## Herramientas de análisis
Para explorar código, analizar logs o procesar outputs grandes, usa siempre 
las herramientas MCP de context-mode (ctx_batch_execute, ctx_execute_file, ctx_search)
en lugar de Bash o Read para análisis.

Existe un conjunto de herramietnas porporcionadas por rtk, si puedes usa rtk.