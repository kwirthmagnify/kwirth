# Thin scopes: permisos finos que el canal interpreta

> **Estado: PRD, diseño cerrado en el debate del 2026-10-17.** No hay PLAN todavía. Las decisiones de
> §3 están tomadas por el usuario y no se renegocian aquí.

## Por qué

Hoy un permiso se concede como `channel$scope` sobre un patrón de recursos de Kubernetes
(`namespaces:groups:pods:containers`). Eso cubre *"¿puede escribir?"* y *"¿sobre qué pod?"*, y se queda
corto en cuanto la pregunta es **sobre qué cosa del canal**:

- *"Puede escribir, pero solo en `/usr/app`"* — una ruta no es un objeto de Kubernetes.
- *"Puede leer todos los recursos **menos** configmaps y secrets"* — un tipo de recurso tampoco.

El core no puede entender ninguno de los dos: no sabe qué es una ruta para File Manager ni qué es un
tipo de recurso para Magnify, y aprenderlo significaría tocar el core cada vez que aparece un canal.

## Lo que se descartó, y por qué importa

Se empezó por **ABAC** (atributos de sujeto, recurso y contexto, con reglas y condiciones) y se
abandonó al escribir los casos de uso reales. Ninguno pedía condiciones, ni contexto, ni hora del día:
los tres pedían **restringir un permiso a un subconjunto que solo el canal sabe nombrar**. ABAC traía
lenguaje de políticas, editor, depuración de *"¿por qué me ha denegado?"* y atributos de sujeto que hoy
no existen —`IUser` guarda `id`, `name`, `resources` e `idp`, y los claims del IdP se descartan— para
resolver algo que no era el problema.

El reconocimiento dejó además tres datos que conviene no volver a descubrir:

| | |
|---|---|
| Los valores de recurso **ya son regex** | `getValidValues()` hace `new RegExp(r).test(value)` |
| Los scopes son **escalera y conjunto a la vez** | `getScopeLevel()` es escalera por canal; `hasScope()` es pertenencia (12 llamadas, las 12 por `'admin'`) |
| Solo hay **tres** puntos de decisión | `hasScope()` (la ruta), `getScopeLevel()` (el nivel) y `checkResource()` (el objeto) |

## El formato

Al lado del `channel$scope` de siempre aparece una segunda forma, **con otro separador**:

```
channel#scope#config
```

- `channel` y `scope` son los de siempre (`fileman`, `write`).
- `config` es **base64**, y su contenido lo define y lo entiende **solo el canal**.

Ejemplo: *"escribir solo en `/tmp`"* es `fileman#write#L3RtcA==`.

**El base64 no es ofuscación, es la única codificación segura.** `resources` se parte por `;`
(recursos), `:` (campos) y `,` (scopes), y ahora por `#`. El alfabeto base64 (`A–Z a–z 0–9 + / =`) **no
contiene ninguno de los cuatro**, así que admite cualquier contenido —una ruta, una regex, una lista,
un JSON— sin escapes ni casos límite.

⚠️ **El administrador nunca escribe base64 ni lo ve.** Teclea en un formulario; el front codifica al
guardar y descodifica al mostrar. Ver §2.

## 1. El core no cambia

Es el hallazgo que simplificó el diseño entero. `getScopeLevel()` **no parsea los tokens**: se los pasa
tal cual a la escalera del canal.

```ts
channels.get(channelId)!.getChannelScopeLevel(sc)
```

De ahí salen dos propiedades, gratis:

- **El canal que implementa thin scopes** parte el token él mismo, usa la parte `scope` para su escalera
  y guarda el `config` para cuando compruebe el objetivo.
- **El canal que no los implementa** hace `indexOf('fileman#write#…')` → **`-1`** → no concede nada.

🔴 **Fail-closed por construcción, sin una línea en el core.** Una clave con permisos finos contra un
Kwirth o un plugin que no los entiende no amplía nada: simplemente no concede. Y como el core nunca
normaliza el token, **no existe** la combinación peligrosa de "core que entiende `#` + canal que no",
que era el riesgo que se temía al principio.

Un helper en `common-back` para partir el token evita que cada canal se invente el parseo.

## 2. La config se rellena en un formulario, no se teclea

El mecanismo ya existe y se usa en senders, providers e IdPs: `IConfigFieldDef[]` y el
`ConfigFormDialog` genérico del front. Basta un campo opcional en un interfaz que ya existe:

```ts
export interface IExtensionScope {
    scope: string
    label: string
    description: string
    config?: IConfigFieldDef[]   // si está, el editor pinta un formulario
}
```

- **Sin `config`** → un textfield libre. Suficiente para una ruta, una regex o una lista por comas.
- **Con `config`** → formulario, como el de un sender. El admin **rellena campos, no aprende sintaxis**.
- El front serializa a JSON, lo codifica y compone `channel#scope#<b64>`; al reabrir el permiso lo
  descodifica y repinta el formulario con sus valores.

Y no encierra a nadie: un canal que quiera JSON crudo declara **un** campo `text` y lo parsea él. El
esquema es un default cómodo, no una jaula.

⚠️ **Descodificar al mostrar es obligatorio en los cuatro sitios**, no solo en el formulario: el resumen
del recurso en la lista, el export de configuración y la traza cuando se deniega algo. El momento en que
un permiso importa auditarlo no es cuando se concede, es seis meses después.

## 3. Decisiones tomadas

| # | decisión | por qué |
|---|---|---|
| 1 | El `config` es **base64**, generado por el front a partir de lo que el admin teclea | Es la única codificación inmune a los cuatro separadores de `resources` |
| 2 | El core **no cambia**: el canal mapea su propio token | Fail-closed gratis, y ningún canal de terceros obliga a tocar el core |
| 3 | **Gana el ancho**: `fileman$write` junto a `fileman#write#/tmp` concede lo ancho | Los recursos se combinan con OR y siempre ha sido así; cambiarlo sería meter `deny` por la puerta de atrás |
| 4 | El canal **valida el config en runtime, siempre**; un config inválido **no concede nada** | El formulario valida al conceder, pero una API key se fabrica a mano con `/key` y se lo salta entero |

🔴 **Sobre la 3, hace falta una guarda de UI.** Un admin que ve `fileman$write` concedido y añade
`fileman#write#/tmp` creyendo que acota **no acota nada**, y nadie se lo dice. Es el mismo patrón que ya
ha aparecido tres veces en este producto —`groups` que la puerta no mira, los scopes de Agora que no
gradúan, los de File Manager que no se podían conceder—: *un permiso que se concede y no hace nada*. El
editor debe **avisar** cuando conviven la forma ancha y la fina del mismo `channel$scope`. No es cambiar
la regla, es no dejar que la trampa sea silenciosa.

## 4. Lo que esto NO resuelve

🔴 **Un thin scope solo sirve si el canal comprueba el OBJETIVO**, y hoy varios no lo hacen. El gate que
se acaba de poner en File Manager contesta *"¿puede escribir?"*; un thin scope pregunta *"¿puede
escribir **ahí**?"*. Son los dos ejes —el verbo y el destino— y este PRD solo aporta el vocabulario para
el segundo.

Que cada canal lo adopte es **su** stream, no éste. Pero mientras no lo haga, sus permisos finos no
limitan nada: hay que publicarlos juntos, canal por canal.

## 5. Límites y riesgos

| riesgo | detalle |
|---|---|
| **Tamaño de la cabecera** | `resources` viaja dentro de la accessKey, y la clave de sesión va en `Authorization` en **todas** las llamadas REST del front al core (no solo en las bearer): `App.tsx`, los diálogos de extensiones, seguridad, clusters, DCEs, ajustes, y los endpoints de `fileman` y `magnify`. Un JSON de ~200 B son ~270 caracteres; con tres o cuatro scopes finos, ~1 KB sobre un techo práctico de ~8 KB. No bloquea, pero el config no es sitio para una lista de cien namespaces |
| **Versionado del config dentro del canal** | `fileman` v1 entiende el config como prefijo y v2 añade globs: una clave escrita para v2 sobre v1 se interpreta como literal. Es del canal, no del sistema, pero el canal tiene que versionarlo |
| **`hasScope()` no ve los thin scopes** | Compara por igualdad exacta, así que un token fino nunca casará con `'admin'`. Es fail-closed y correcto, pero conviene tenerlo escrito |
| **N sintaxis** | Mitigado por el formulario del §2: si cada canal declara su `config`, el admin no aprende sintaxis. Sin eso, el mecanismo se vuelve impracticable con cinco canales |
