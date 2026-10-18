# Plan — Thin scopes (core)

> **Estado: fase previa ENTREGADA (P2 el 2026-10-17, P1 el 2026-10-18); los streams S1–S3, sin empezar.**
> PRD validado el **2026-10-17** ([PRD.md](PRD.md)); las cuatro decisiones de su §3 están tomadas y no se
> reabren aquí.
>
> **Alcance: solo el core.** Este plan entrega el *mecanismo*: el contrato, el helper y el editor. Que un
> canal lo aproveche es **su** stream, y el primero será **magnify** (§5).

---

## 1. De dónde parte

Lo que el reconocimiento dejó cerrado, y que explica por qué este plan es más pequeño de lo que parece:

- **El core no parsea los scopes.** `getScopeLevel()` le pasa cada token a la escalera del canal
  (`channels.get(id)!.getChannelScopeLevel(sc)`), así que un canal que no entiende
  `fileman#write#<b64>` devuelve `-1` por `indexOf` y **no concede nada**. Fail-closed por
  construcción, sin tocar `AuthorizationManagement`.
- **El catálogo ya viaja al front.** `GET /core/scopes` sirve `CORE_BUILTIN_SCOPES` + el
  `getScopeCatalog()` de cada canal; añadir un campo a `IExtensionScope` llega al editor solo.
- **El formulario ya existe.** `IConfigFieldDef[]` + `ConfigFormDialog` es lo que ya usan senders,
  providers e IdPs.

Luego el trabajo de core es: **un campo en un interfaz, un helper, y el editor**.

---

## 2. Fase previa (validada el 2026-10-17)

Dos refactores que **no son del formato** pero que, sin ellos, cada stream de abajo escribe otra copia
de algo que ya existe dos o tres veces. Salieron de revisar el plan contra el código real.

### P2 · Consolidar el helper de scopes en `common-back` — ✅ ENTREGADO (2026-10-17), **menos excubitor**

`scopeAllows()` y `keyAllows()` viven en `common-back` **0.6.7**, con los 9 tests que ninguna de las tres
copias tenía. **fileman** y **trivy** ya consumen el helper, publicados y con su entrada de manifest.

🔴 **Falta excubitor**: su fuente está convertida a `keyAllows` pero **sin publicar**. Hasta que se
publique sigue con su `hasScopeKey` propio, que es exactamente la divergencia que P2 venía a cerrar.

La misma función está escrita **tres veces**: `hasScopeKey` (excubitor), `scopeAllows` (fileman, 0.2.27)
y `scopeAllows` (trivy, 0.2.30). Recorre los recursos de la clave y compara con la escalera del canal.

Los thin scopes añaden `parseThinScope`, que **todo canal que los use tendrá que invocar**. Si cada uno
se escribe su propio parseo de `channel#scope#config`, repetimos el error a mayor escala — y esta vez
sobre un **formato de seguridad**, no sobre una comparación de niveles. Un chequeo de seguridad copiado
es un chequeo que diverge.

⚠️ **Arrastra cascada**: publicar `common-back`, subir la dependencia en los tres canales, y **el core
antes que ellos** — los plugins resuelven `common-back` del global del core, que es la trampa que tumbó
el core el 2026-10-16 con los conectores IdP.

### P1 · Extraer el renderizador de `IConfigFieldDef[]` — ✅ ENTREGADO (2026-10-18)

Vive en `front/src/components/extensions/ConfigFields.tsx`, y lo usan `ConfigFormDialog` (providers y
logins) e `IdpConfigDialog` (IdPs). **Sin fetching**: `ConfigFormDialog` se queda el endpoint (GET/PUT y
el TEST) y el componente solo dibuja, que es lo que permite reutilizarlo en S2, donde los valores no
viven en ningún endpoint. QA validado en sus tres partes (provider, IdP y login).

**Dos decisiones que obligaron las copias, porque guardaban en formatos distintos** — `ConfigFormDialog`
guarda **texto** (`'true'`) e `IdpConfigDialog` guarda **tipado**:

1. El componente emite **tipado** y `ConfigFormDialog` lo devuelve a texto con `String()`. 🔴 Un número
   **vaciado** emite `''` y **no `0`**: con `0`, `buildBody` dejaría de omitirlo y guardaría un cero que
   nadie tecleó.
2. Los `number` de `ConfigFormDialog` pasan a `type='number'` (antes eran de texto), como ya hacían los
   otros dos. Es el único cambio visible del refactor.

El ojo de los secretos es **un control con dos significados**, resueltos con `onRevealSecret`: en
providers y logins solo enseña lo que hay en el campo; en IdP va a buscar el valor real a
`/core/idps/export`, porque lo que tiene es una máscara.

**Efecto lateral bueno, latente**: el diálogo de IdP **no pintaba `select` ni `multiselect`** —caía a un
campo de texto libre— y ahora sí, porque comparte renderizador. Hoy no se nota: ningún conector declara
más que `text` y `password`. La prosa del contrato en `common/src/ExtensionConfig.ts` decía lo contrario
y se ha corregido (solo comentario; no hay que publicar `common`).

⚠️ **Corrección a lo que decía este plan**: la superficie de regresión **no** incluía senders ni webhooks.
Esos dos van por `ConfigListDialog`, que es otro diálogo. Los consumidores reales eran **providers,
logins e IdPs**, y nada más.

#### Backlog que deja P1

- **Queda una TERCERA copia del renderizador sin unificar: la de `ConfigListDialog`** (senders y
  webhooks). Se dejó fuera **a propósito**, y no por pereza: es distinta de verdad —el booleano es una
  fila con el switch a la derecha, el select es un `Select` con opción vacía `—`, y el `*` de obligatorio
  va escrito a mano en la etiqueta en vez de por `required`—. Unificarla **cambia su aspecto**, así que es
  decisión de UX y no de refactor. No bloquea S2.
- **La rama de `multiselect` no la cubre nadie.** `provider-config-test` › *su formulario saca el botón
  TEST, y un multiselect con checkbox* se **salta** porque ningún provider con `/test` usa el formulario
  del core (`sugarless` y `aws` traen front propio), y **ninguna extensión del árbol declara un
  `multiselect`** — ni pública ni privada. El código va copiado tal cual del original, pero conviene
  saber que no hay red debajo.

### P1 · El problema que resolvía (para el registro)

`ConfigFormDialog` **está atado a un endpoint** (recibe `endpoint`, hace el `GET` y el `PUT`), así que
no vale tal cual para los thin scopes, cuyos valores no viven en ningún endpoint: se componen en un
token dentro del editor de seguridad. Y su pintado de campos es una función local `field(f)` entre sus
283 líneas, sin exportar.

🔴 **Ya está duplicado**: `IdpConfigDialog` tiene su propio `campo(f)` haciendo lo mismo. Van dos
copias, y S2 sería la tercera.

Extraerlo a un componente que reciba `schema` + `values` + `onChange`, y que lo usen los dos diálogos
actuales. Entonces S2 es *"píntame este schema"* y poco más.

⚠️ **Tiene superficie de regresión**: es refactor de un componente compartido del core, no un añadido.

**Orden: P2 antes que P1.** Es más barato, su cascada es conocida, y es donde vivirá `parseThinScope`.

## 3. Streams

### S1 · El contrato y el helper (`common`)

El helper va en **`common`**, no en `common-back`: lo necesitan **los dos lados** —el canal para leer su
token, el front para componerlo— y `common-back` y `common-front` reexportan `common`, así que ponerlo
ahí alcanza a todos sin duplicar.

1. `common/src/ExtensionScope.ts` — `IExtensionScope.config?: IConfigFieldDef[]`, opcional.
2. En el mismo fichero, el par de funciones que define el formato:

   ```ts
   buildThinScope(channel: string, scope: string, config: unknown): string   // → 'channel#scope#<b64>'
   parseThinScope(token: string): { channel, scope, config } | undefined     // undefined si no es fino
   ```

   `parseThinScope` **no lanza**: un token mal formado, un base64 roto o un JSON inválido devuelven
   `undefined`, que el canal tratará como *no concede nada* (decisión 4 del PRD).
3. Tests: ida y vuelta con ruta, regex, lista y JSON; que ningún resultado contenga `; : , #`; que un
   token clásico (`fileman$write`) devuelva `undefined`; y que base64 roto no reviente.

**Cierre:** publicar `common`, y la cascada de dependientes que toque. Sin esto nada más compila.

### S2 · El editor de seguridad (core front)

Es el grueso. Hoy `ResourceEditor` es un multi-select cuyo `value` son los scopes
(`front/src/components/security/ResourceEditor.tsx`), y un thin scope **no es una opción más**: es una
opción que al marcarse abre un formulario y produce un token.

1. **Elegir** — al marcar un scope cuyo catálogo declara `config`, abrir el formulario
   (`ConfigFormDialog` con ese `IConfigFieldDef[]`). Al aceptar, el token entra en `scopes[]`; al
   cancelar, no se marca.
2. **Sin `config` declarado** — un único textfield libre, que es el default del PRD. Sirve para una
   ruta, una regex o una lista por comas.
3. **Reabrir** — un token fino ya guardado tiene que volver a pintarse como *su* opción del catálogo,
   marcada, y con el formulario relleno con los valores descodificados. Es lo que hace auditable el
   permiso seis meses después.
4. **Mostrar** — el `renderValue` del select hace hoy `s.join(',')`; con un base64 dentro queda
   ilegible. Debe mostrar la etiqueta del catálogo y un resumen **descodificado** del config.
5. 🔴 **La guarda** — avisar cuando en el mismo recurso conviven la forma ancha y la fina del mismo
   `channel$scope`. Gana la ancha (decisión 3), así que la fina no acota nada y **el admin tiene que
   saberlo**. No es cambiar la regla; es que la trampa no sea silenciosa.
6. **Dónde** — el editor lo comparten `ManageUserSecurity` y `ManageApiSecurity`; el cambio es del
   componente, y hay que comprobar los dos.

**Cierre:** CL9 del core (sin publish ni tag). E2E sobre el editor: conceder un thin scope, guardarlo,
reabrirlo y ver el formulario relleno; y que salte el aviso de la guarda.

### S3 · Documentación

1. **Guía de admin** — `04-security-and-permissions`: qué es un thin scope, cómo se lee
   `channel#scope#config`, y 🔴 que **gana el ancho**, con el ejemplo de la trampa.
2. **Guía de extensiones** — cómo declara un canal su `config` en `getScopeCatalog()`, con ejemplo.
3. **Límite de tamaño** — documentar el techo práctico (§5 del PRD): el config no es sitio para una
   lista de cien namespaces.

---

## 4. Lo que este plan NO hace

- **No toca `AuthorizationManagement` ni `getScopeLevel`.** Es la decisión 2 del PRD y lo que da el
  fail-closed gratis. Si en algún momento parece necesario tocarlos, es que el diseño se ha torcido.
- **No valida en el back que el canal del token exista.** Un token hacia un canal desinstalado ya no
  concede nada por la vía natural (`-1`). Añadir validación al guardar sería comodidad, no seguridad.
- **No cubre el OBJETIVO en ningún canal.** Un thin scope solo limita si el canal comprueba sobre qué
  actúa, y eso es trabajo de cada canal.
- **No separa la clave de WebSocket de la de cabecera.** Está en el roadmap y es otra cosa, aunque el
  techo de tamaño de §5 del PRD salga de ahí.

---

## 5. Riesgos

| riesgo | mitigación |
|---|---|
| **Un permiso que se concede y no hace nada** — ya ha pasado tres veces en este producto (`groups` que la puerta no mira, los scopes de Agora que no gradúan, los de File Manager que no se podían conceder) | La guarda de S2.5, y publicar el mecanismo **junto al primer canal que lo use** para que el día uno haya algo que limite de verdad |
| **El editor se vuelve el cuello de botella** | S2 es el único stream con riesgo real de alcance: tiene cuatro interacciones nuevas sobre un componente compartido por usuarios y API keys |
| **Cascada de `common`** | S1 obliga a republicar y a subir dependientes. Es conocido y acotado, pero va primero y bloquea al resto |

---

## 6. Después de este plan: el primer canal

**Magnify**, por interés del usuario. Su stream, no éste, y necesitará lo mismo que cualquier otro:

1. Declarar `config` en su `getScopeCatalog()` y decidir su forma. En Magnify son tipos de recurso, y
   el UC era *"todo menos configmaps y secrets"* — o sea **exclusión**.

   ⚠️ La exclusión **no pide nada al formato ni al core**: el `config` es opaco, así que Magnify la
   expresa dentro de su propio JSON (`{"exclude":["configmap","secret"]}`, o como decida) y el core no
   se entera. Es diseño del canal, y se resolverá al implementar el primero que use thin scopes.

   🔴 Y ahí está el argumento de por qué la exclusión hace falta: enumerar en positivo **no es
   equivalente**. Un CRD nuevo no entra en una lista escrita ayer, y no entra **en silencio**. Ya pasó
   en este repo con el Role de Kubernetes: la versión enumerada soltó 156 líneas de `Forbidden` y hubo
   que irse al comodín.
2. Partir su token con `parseThinScope()` en `getChannelScopeLevel`.
3. **Comprobar el objetivo** usando el config — sin esto, lo anterior no limita nada.
4. Validar el config en runtime, siempre (decisión 4): una API key se fabrica a mano y se salta el
   formulario.
