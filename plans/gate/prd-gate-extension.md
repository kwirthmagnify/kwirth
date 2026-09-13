# PRD — Gate: la pantalla de acceso como tipo de extensión programable

**Estado:** borrador
**Autor:** Julio
**Componente:** `kwirth-front` (`LoginExtensionPage.tsx`), `kwirth-back` (`LoginManager`, `LoginExtensionApi`), `kwirth-common`
**Documentos relacionados:**
- `plans/login-extensions/PLAN.md` — el tipo `login` actual, sus límites verificados y el backlog S5 que este PRD sustituye
- `plans/shell/prd-1-shell-extension.md` — mismo patrón (núcleo sin UI + contrato inyectado), aplicado a la vista principal

---

## 1. Qué se propone

Un tipo de extensión nuevo, **`gate`**: la pantalla de acceso a Kwirth escrita **como código**, no como configuración.

Hoy existe el tipo `login`, y funciona: diez extensiones vivas en producción. Pero es un **renderer fijo**. `LoginExtensionPage.tsx` pinta siempre lo mismo —fondo a página completa y **un** panel posicionable con campos MUI `standard`— y el bundle admite exactamente `login.json` + **un** `background.png`. Todo lo que no cabe en ese molde hay que **hornearlo en el PNG**, y lo horneado es decoración muerta: no se puede pulsar.

`gate` invierte el reparto. El núcleo deja de pintar y pasa a **ofrecer la autenticación como contrato sin UI** (`IGateObject`); la extensión trae su propio componente y pinta lo que quiera. La extensión decide **cómo se pide**; el núcleo sigue decidiendo **cómo se comprueba**.

## 2. Por qué ahora

El backlog S5 del plan de logins enumera siete campos nuevos de `ILoginConfig` (color del botón primario, slot de logo, enlaces, *remember me*, tipografía, ocultar cambio de contraseña, layout de dos columnas). Es una lista sintomática: cada marca nueva pide un campo nuevo, y el propio plan cierra con la advertencia de que tocar `ILoginConfig` **obliga a revisar los diez logins existentes**, porque sus posiciones están calculadas en porcentajes contra su propio PNG.

Ese es el patrón de un contrato declarativo que ha dejado de escalar: crece hacia el infinito, nunca llega, y cada crecimiento es un cambio de riesgo global. Tres carencias concretas del plan actual lo ilustran:

- **Los themes no llegan al login** (se cargan tras `logged`, con petición firmada). El formulario sale siempre con el MUI por defecto: foco azul y botones en MAYÚSCULAS. Un theme de marca **no arregla el login**, y eso no se cierra con un campo más.
- **Los enlaces legales** (privacidad, cookies, términos) son obligatorios en banca y seguros, y hoy solo pueden ir horneados en el PNG, es decir **no clicables**. Un enlace legal que no navega no es un detalle estético.
- **`idpButton` solo sustituye `{provider}` con un IdP**; con dos o más se imprime la cadena cruda. Es un caso particular de un problema general: la plantilla de texto no es un lenguaje, y en cuanto hay lógica se queda corta.

## 3. Nombre del tipo

El tipo se llama **`gate`** (`EExtensionType.GATE`). El candidato natural, `access`, **se descarta**: está semánticamente ocupado dentro de Kwirth y significa otra cosa —`AccessKey`, `accessKey.resources`, `accessString`, los scopes de `ResourceIdentifier`—. Un `EExtensionType.ACCESS` se leería como *control de acceso* (autorización, quién puede ver qué namespace) y no como *pantalla de acceso*, y esa colisión se paga en cada conversación y en cada búsqueda en el código.

| Candidato | A favor | En contra |
|---|---|---|
| **`gate`** ✅ | Corto, singular, inequívoco, encaja con el enum actual (`plugin`, `theme`, `homepage`, `docs`, `pack`) | Ninguna colisión conocida |
| `portal` | Reconocible para un operador | Sugiere un sitio entero, no una pantalla |
| `access` | Es lo que es, en literal | Choca con `AccessKey` / scopes / autorización |
| `signin` | Explícito | Verbo compuesto; rompe el estilo del enum |

- **RF-00.** El valor del enum es `gate`, en singular y en minúsculas, coherente con el resto de `EExtensionType`. La ruta HTTP asociada queda en plural (`/gates`), como el resto de contratos existentes.

## 4. Objetivos

- **O1.** Definir `gate` como tipo de extensión de primer nivel, con **código propio en el front**, distribuido por el mismo mecanismo que el resto de extensiones.
- **O2.** Exponer la autenticación del núcleo como contrato sin UI, `IGateObject`, de modo que el núcleo no imponga ni un solo píxel.
- **O3.** Reproducir con fidelidad total una pantalla de acceso de marca, **sin hornear cromo**: enlaces navegables, botones con estilo propio, tipografía propia, layout libre.
- **O4.** Mantener las garantías de seguridad actuales: las credenciales se comprueban donde se comprueban hoy, y la extensión **nunca** sostiene el token de sesión.
- **O5.** Que nadie se quede fuera: un fallo de la extensión no puede impedir entrar en Kwirth.

### No-objetivos

- No se sustituye el tipo `login` (ver §10), ni se migran las extensiones existentes.
- No se cambian los métodos de autenticación ni el protocolo de IdP (`/auth/:instanceId/start`, `/callback`, `/exchange`).
- No se introduce MFA, captcha ni federación nueva; si una extensión los quiere, será sobre un contrato ampliado y en otro documento.
- No se toca el modelo de autorización (`AccessKey`, scopes, `ResourceIdentifier`).
- No se define aquí la pantalla de administración posterior al login: eso es la shell.

## 5. Alcance de un gate

**Lo que asume la extensión:** todo lo visual y toda la interacción. Layout, tipografía, animaciones, imágenes, enlaces, selector de idioma, textos y su traducción, orden y presentación de los métodos de autenticación, validación de formulario, y el aspecto de los errores.

**Lo que sigue siendo del núcleo:** comprobación de credenciales, política y cambio de contraseña, hash, redirección y *callback* de IdP, canje del código, emisión y custodia del `accessKey`, la sesión resultante y la decisión de a dónde se va después de entrar.

- **RF-01.** El núcleo no impone marcado ni estilo a la pantalla de acceso: no hay panel, ni campos, ni botones obligatorios.
- **RF-02.** El gate no construye peticiones HTTP de autenticación ni conoce las rutas del backend; todo pasa por `IGateObject`.
- **RF-03.** El gate no recibe el `accessKey` ni ningún material de sesión. Recibe el resultado: entró, o no entró y por qué.
- **RF-04.** El hash de la contraseña lo hace el núcleo dentro del contrato; el gate entrega el valor tal cual lo tecleó el usuario y no lo persiste.

## 6. `IGateObject`

El contrato entre núcleo y gate es **un único objeto inyectado al instanciar** el componente, igual que `IShellObject` en el PRD de la shell. Un solo punto de entrada se versiona, se documenta y se sustituye por un doble en pruebas.

### 6.1 Miembros

- **Consultas.** Qué métodos de autenticación hay disponibles (contraseña, IdPs con su nombre e identificador), si el cambio de contraseña está permitido, la configuración declarada por el propio gate, y el estado del backend.
- **Comandos.** Entrar con usuario y contraseña, cambiar la contraseña, iniciar el flujo de un IdP concreto.
- **Suscripciones.** Progreso y resultado de un intento en curso, y errores que llegan de vuelta de un *callback* de IdP.

### 6.2 Requisitos

- **RF-05.** `IGateObject` se inyecta al instanciar el componente raíz del gate; no se importa de un global ni de un singleton.
- **RF-06.** El contrato está versionado. El gate declara qué versión requiere y el núcleo se niega a cargarlo si no la satisface, con un mensaje legible para un operador.
- **RF-07.** Los errores del contrato son **códigos estables**, no cadenas de texto. El gate decide el mensaje que muestra y en qué idioma; el núcleo no le impone literales.
- **RF-08.** El contrato expone la lista de IdPs disponibles con identificador y nombre, sin limitación de cardinalidad: un gate puede pintar uno, ocho o ninguno.
- **RF-09.** Un intento fallido no revela al front si falló el usuario o la contraseña, exactamente como hoy.
- **RF-10.** El núcleo aplica limitación de intentos independientemente de lo que haga el gate: la protección no puede depender de código instalable.

## 7. Seguridad

Este es el punto delicado del PRD y conviene decirlo sin rodeos: **el código de un gate se ejecuta antes de que nadie se haya autenticado**, se sirve sin sesión y es lo primero que ve un usuario en el dominio de Kwirth. Un gate malicioso es, literalmente, una página de *phishing* servida desde el dominio legítimo.

El tipo `login` ya tiene parte de este problema —un PNG puede imitar cualquier cosa—, pero un bundle ejecutable lo amplía: puede leer lo que se teclea y enviarlo fuera. El diseño no puede eliminar ese riesgo (lo instala un administrador, con sus permisos), pero sí acotarlo y hacerlo visible.

- **RF-11.** El núcleo es el único que posee el `accessKey`. El gate no puede leerlo ni por contrato ni por almacenamiento del navegador.
- **RF-12.** Instalar un gate exige el mismo permiso que instalar un plugin, y la UI advierte explícitamente de que **ejecuta código en la pantalla de acceso**. No es una advertencia genérica.
- **RF-13.** La procedencia (marketplace, URL, fichero, dev) se guarda y **se muestra en el gestor**, como ya se hace con el resto de extensiones.
- **RF-14.** Se define una política de contenido para la página de acceso que acote a dónde puede hablar el bundle. El alcance exacto es materia de diseño, pero la decisión de que exista se toma aquí.
- **RF-15.** El bundle se sirve **sin autenticar** —no queda otra— y por tanto es público; el diseño no asume confidencialidad de su contenido.

## 8. Empaquetado y almacenamiento

Un `login` cabe hoy en un ConfigMap porque son dos ficheros pequeños y el fondo viaja en base64, con un tope duro de ~800 KiB (`CONFIGMAP_SIZE_LIMIT`). Un gate trae bundle, hojas de estilo, tipografías e imágenes: **ese almacenamiento no sirve**, y fingir que sí es garantizar instalaciones a medias.

- **RF-16.** El bundle admite **múltiples ficheros** de assets, no uno fijo, con sus tipos declarados.
- **RF-17.** El almacenamiento de un gate no está sujeto al límite de objeto de un ConfigMap. Dónde vive exactamente es decisión de diseño, no de este PRD.
- **RF-18.** Las dependencias pesadas (React, MUI) **no se empaquetan**: se consumen de los globales que ya expone el núcleo para los plugins. Un bundle de gate es ligero.
- **RF-19.** Si la instalación queda incompleta —falta un asset, no cabe algo—, se marca como `problem` y la pantalla lo indica, como ya hace el tipo `login`.
- **RF-20.** En desarrollo, los assets **no se cachean**. El tipo `login` arrastra hoy un `Cache-Control: public, max-age=3600` que se aplica también a los logins `dev` y hace perder tardes enteras: el tipo nuevo no nace con ese defecto.

## 9. Ciclo de vida y vía de escape

- **RF-21.** Cada gate instalado es alcanzable por su identificador; no hay concepto de "activar", igual que en `login`.
- **RF-22.** Existe una pantalla de acceso **del núcleo**, siempre presente, alcanzable por una ruta fija y documentada.
- **RF-23.** Si el gate no se encuentra, no carga, revienta al montar o declara una versión de contrato incompatible, el núcleo cae a esa pantalla y **dice por qué**.
- **RF-24.** El fallo se registra en el log del backend: una pantalla de acceso rota deja rastro en el servidor, no solo en la consola del navegador de quien la sufrió.

Este apartado no es defensivo por costumbre. Es el único componente de Kwirth cuyo fallo impide entrar a arreglarlo.

## 10. Relación con el tipo `login`

Los dos tipos **coexisten**. `login` es el camino declarativo, sin código y sin riesgo, y resuelve la mayoría de los casos: un fondo, un panel, unos textos. `gate` es el camino programable, para cuando la fidelidad de marca o la funcionalidad no caben.

- **RF-25.** Las diez extensiones `login` existentes siguen funcionando sin cambios.
- **RF-26.** El backlog **S5 queda congelado**: `ILoginConfig` no crece más. Lo que pedía S5 se obtiene escribiendo un gate.
- **RF-27.** Ambos tipos se gestionan desde la misma UI de extensiones, con la distinción de tipo visible.

La alternativa —que `gate` absorba a `login`— se descarta: obligaría a escribir código para cambiar un color de fondo, y convertiría en obligatorio un riesgo que hoy es opcional.

## 11. Requisitos no funcionales

- **RNF-01.** Un usuario que no instala ningún gate no percibe ningún cambio.
- **RNF-02.** La pantalla de acceso no se vuelve perceptiblemente más lenta; el coste añadido es el del bundle del gate, y el tamaño típico se documenta.
- **RNF-03.** El contrato es testeable sin backend: un gate se desarrolla contra un `IGateObject` falso.
- **RNF-04.** Existe un gate de ejemplo, mínimo y legible, que sirve de plantilla y de prueba viva del contrato.
- **RNF-05.** La guía documenta el contrato, el empaquetado, la vía de escape y **el modelo de riesgo** de §7. Esto último no es opcional: quien instala tiene que entender qué está instalando.
- **RNF-06.** El gate de ejemplo cumple lo mínimo de accesibilidad —foco visible, navegación por teclado, campos etiquetados— y la guía lo señala como expectativa, no como adorno.

## 12. Decisiones ya tomadas

| Decisión | Resolución | Motivo |
|---|---|---|
| Nombre del tipo | `gate` | `access` colisiona con `AccessKey` y los scopes: se leería como autorización |
| Tipo nuevo o ampliar `login` | Tipo nuevo | Ampliar `ILoginConfig` ya no escala, y cada cambio arrastra a los diez logins vivos |
| Convivencia | `login` y `gate` coexisten | Un cambio de color no debe exigir escribir código |
| Cómo llega el contrato | Inyección al instanciar | Versionable, testeable, mismo patrón que `IShellObject` |
| Quién custodia el token | El núcleo, siempre | El gate corre sin sesión y no es código de confianza |
| Dependencias pesadas | Globales del núcleo, no empaquetadas | Coherencia con los plugins; bundles ligeros |
| Vía de escape | Pantalla del núcleo en ruta fija | Es el único componente cuyo fallo impide entrar a arreglarlo |
| Backlog S5 | Congelado | Su motivación desaparece con este tipo |

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Gate malicioso o comprometido robando credenciales | §7 completa: custodia del token en el núcleo, advertencia explícita al instalar, procedencia visible, política de contenido |
| El contrato sale moldeado sobre la pantalla actual y no admite una distinta | Esbozar dos pantallas de marca reales contra el contrato antes de cerrarlo |
| Fragmentación: cada marca con su pantalla, ninguna accesible | Gate de ejemplo accesible + expectativas documentadas |
| Los autores recrean la lógica de autenticación por su cuenta | RF-02: no conocen las rutas; el contrato es el único camino |
| Duplicidad de esfuerzo entre `login` y `gate` | S5 congelado: no se invierte más en el declarativo |
| Una pantalla rota deja fuera a todo el mundo | RF-22 a RF-24, y e2e que verifique la vía de escape |

## 14. Fases

1. **Contrato.** Definir `IGateObject`, su versionado y los códigos de error, extrayendo de `LoginExtensionPage.tsx` la lógica que hoy está mezclada con el pintado.
2. **Carga y ciclo de vida.** Tipo nuevo, empaquetado con assets múltiples, montaje del componente, vía de escape y fallback.
3. **Gate de ejemplo.** La plantilla mínima, que es donde aparecen los huecos reales del contrato.
4. **Una pantalla de marca real.** Reproducir con un gate un login existente que hoy hornea el cromo, y comprobar que los enlaces navegan.
5. **Seguridad.** Política de contenido, advertencia de instalación, y revisión dirigida a que el token no sea alcanzable.
6. **Documentación.** Guía de autor, modelo de riesgo, y actualización de la guía del tipo `login` con la frontera entre ambos.

## 15. Abierto

1. ¿Dónde se almacenan los assets si no caben en un ConfigMap? Afecta a las tres formas de despliegue (Kubernetes, Docker, node suelto).
2. ¿Puede un gate traer su propio theme, o se resuelve antes el hueco de que los themes no lleguen a la pantalla de acceso?
3. ¿El contrato debe cubrir ya el registro de usuario y el "he olvidado mi contraseña", o se deja fuera hasta que exista en el núcleo?
4. ¿Un gate puede tener configuración editable por el administrador (`configSchema`), como la tienen hoy los logins, o su configuración es cosa suya?
5. ¿Se permite que un gate declare a qué canal se entra tras el login (`startChannel`), sabiendo que hoy ese campo **bloquea el acceso** a quien no tenga ese canal habilitado?
