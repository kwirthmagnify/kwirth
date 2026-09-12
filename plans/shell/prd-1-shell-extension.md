# PRD 1/3 — Shell: nuevo tipo de extensión

**Estado:** borrador
**Autor:** Julio
**Componente:** `kwirth-front` (`App.tsx` → núcleo + shell)
**Documentos relacionados:**
- PRD 2/3 — Variantes de presentación en channels
- PRD 3/3 — Shell de dashboard

---

## 1. Qué se propone

Convertir la vista principal de Kwirth en un **tipo de extensión nuevo, la shell**. Hoy esa vista está codificada en `App.tsx`: resource selector, barra de tabs, y una instancia de channel por tab. Pasa a ser una extensión más, registrada y cargada por el mismo mecanismo que los plugins de channel, con la vista actual como shell por defecto.

Kwirth es extensible en **qué se observa** (channels) pero no en **cómo se observa**. Este PRD cubre únicamente la plataforma que lo hace posible. Los dos documentos hermanos cubren la ampliación de los channels y la primera shell alternativa.

## 2. Objetivos

- **O1.** Definir "shell" como tipo de extensión de primer nivel, al mismo nivel conceptual que un channel.
- **O2.** Separar el núcleo funcional de Kwirth de su representación, de forma que el núcleo no dependa de React.
- **O3.** Exponer ese núcleo a la shell mediante un único objeto de contrato, `IShellObject`.
- **O4.** Reimplementar la vista actual de tabs como shell por defecto, consumiendo solo el contrato público.
- **O5.** No romper nada: un usuario que no cambia su configuración no percibe diferencia.

### No-objetivos

- No se define aquí el vocabulario de variantes de presentación de los channels (PRD 2).
- No se diseña ninguna shell distinta de la de tabs (PRD 3).
- No se toca el protocolo entre `kwirth-front` y `kwirth-back`.
- No se rediseña la estética de los channels existentes.
- No se contempla más de una shell activa simultáneamente.

## 3. Alcance de una shell

La shell asume todo lo que hoy pinta `App.tsx`:

- Layout general de la aplicación.
- Navegación entre vistas.
- Selección de recursos del cluster y creación de instancias de channel.
- Organización, colocación y ciclo de vida visual de esas instancias.
- Dónde y cuándo se muestran las pantallas de configuración que provee el núcleo.

Queda fuera de la shell: conexión y sesión con el backend, registro de channels, ciclo de vida funcional de las instancias, persistencia de configuración, y la implementación de las pantallas de administración.

## 4. La frontera núcleo / shell

El núcleo expone dos clases de cosas, y la distinción es deliberada.

**Funciones sin UI.** La mayor parte del contrato. Operar el cluster, gestionar instancias, leer configuración, suscribirse a eventos. La shell las llama y pinta lo que quiera con el resultado. El núcleo no impone nada visual.

**Piezas con UI, solo para administración.** Un conjunto acotado de pantallas que sería absurdo obligar a reimplementar a cada autor de shell, y que además conviene que sean idénticas en todas ellas por seguridad y soporte: gestión de usuarios, gestión de clusters, configuración de IA, y las que se añadan de la misma naturaleza. El núcleo las provee montables; **la shell decide si las monta, dónde y cuándo**.

Esa última frase es el equilibrio que se busca: nadie reimplementa la administración, y nadie está obligado a enseñarla. Una shell de pantalla desatendida puede no exponer ninguna; la shell de tabs las coloca donde están hoy.

- **RF-01.** El núcleo no contiene referencias a tabs, paneles, widgets ni a ningún elemento de layout.
- **RF-02.** El núcleo es ejecutable y testeable sin montar ningún componente visual.
- **RF-03.** Las piezas con UI del núcleo se limitan a administración y configuración; no hay ninguna pieza de núcleo que pinte contenido de channels.
- **RF-04.** La shell puede montar cada pieza de administración de forma independiente; no hay un bloque "todo o nada".
- **RF-05.** El núcleo declara qué piezas de administración existen y qué permisos requiere cada una, para que la shell pueda ocultar las que el usuario no puede usar.

## 5. `IShellObject`

El contrato entre núcleo y shell es un único objeto. Un solo punto de entrada facilita versionarlo, documentarlo y sustituirlo en pruebas.

### 5.1 Tres clases de miembros

- **Comandos.** Provocan efectos: crear una instancia, arrancarla, pararla, conectar un cluster.
- **Consultas.** Devuelven el estado actual: instancias vivas, channels registrados, clusters disponibles.
- **Suscripciones.** Notifican cambios. Son lo que permite que la shell sea React o cualquier otra cosa: el núcleo emite, la shell reacciona como quiera.

Sin el tercer grupo el contrato no sirve. Con solo comandos y consultas, una shell no tiene forma de enterarse de que ha llegado una línea de log salvo haciendo polling.

### 5.2 Organización

- **RF-06.** `IShellObject` está organizado por namespaces temáticos (instancias, cluster, configuración, administración, eventos), no como una lista plana de métodos.
- **RF-07.** Cada namespace declara su estado de madurez: estable o experimental. Los estables mantienen compatibilidad dentro de una major.
- **RF-08.** El contrato está versionado. La shell declara qué versión requiere y el núcleo rechaza cargarla si no la satisface, con un mensaje claro.
- **RF-09.** Todo el estado observable por la shell se obtiene por consulta o suscripción del objeto; la shell no accede a estructuras internas del núcleo.

### 5.3 Inyección

- **RF-10.** `IShellObject` se **inyecta a la shell al instanciarla**. No se importa de un módulo global ni de un singleton.
- **RF-11.** En consecuencia, una shell puede instanciarse contra un núcleo de pruebas sin backend real.

### 5.4 Azúcar para React

- **RF-12.** Se publica, aparte del contrato, un paquete opcional de hooks de React que envuelve las suscripciones más habituales.
- **RF-13.** Ese paquete es conveniencia, no contrato: una shell puede ignorarlo por completo y no pierde ninguna capacidad.

## 6. Ciclo de vida de una shell

- **RF-14.** Una shell se registra con identificador, nombre legible, descripción, versión de contrato requerida y componente raíz.
- **RF-15.** Solo hay una shell activa por sesión.
- **RF-16.** La shell activa se determina por configuración y se puede cambiar sin reiniciar el backend.
- **RF-17.** Si la shell configurada no se encuentra, falla al cargar o declara una versión de contrato incompatible, Kwirth arranca con la shell por defecto y avisa al usuario del motivo.
- **RF-18.** Un fallo en tiempo de ejecución dentro de la shell no debe dejar la aplicación sin salida: debe existir una vía para volver a la shell por defecto.

## 7. Distribución

La shell es **un tipo de extensión más** y se distribuye por el mismo mecanismo que los plugins de channel existentes. No se introduce empaquetado propio, registro propio ni ciclo de instalación distinto.

- **RF-19.** El manifiesto de extensión distingue el tipo (`channel`, `shell`) para que Kwirth sepa qué registrar.
- **RF-20.** Una misma extensión puede aportar shells y channels a la vez.
- **RF-21.** El código de las shells no activas no se carga.

## 8. Shell por defecto

- **RF-22.** La vista actual —resource selector más tabs— se reimplementa como shell, con identificador propio, y es la activa por defecto.
- **RF-23.** Se implementa **exclusivamente** sobre `IShellObject`. Cualquier necesidad que obligue a puentear el contrato se trata como un hueco de la API y se resuelve ampliando el contrato, nunca saltándoselo.
- **RF-24.** Un usuario que no cambia su configuración obtiene la misma experiencia que antes de este cambio.

Este punto es el criterio de aceptación real del PRD. Si la shell de tabs necesita acceso privilegiado al núcleo, el contrato está incompleto y ninguna shell de terceros será viable.

## 9. Requisitos no funcionales

- **RNF-01.** Los channels y plugins existentes siguen funcionando en la shell por defecto sin cambios en su código.
- **RNF-02.** El arranque con la shell por defecto no es perceptiblemente más lento que el actual.
- **RNF-03.** El núcleo tiene pruebas que no requieren entorno de navegador.
- **RNF-04.** `IShellObject` está documentado por namespace, con un ejemplo mínimo de shell ejecutable.
- **RNF-05.** El error de carga de shell y el de versión incompatible son legibles para un operador, no solo para un desarrollador.

## 10. Decisiones ya tomadas

| Decisión | Resolución | Motivo |
|---|---|---|
| Qué abarca la shell | Todo lo que hoy pinta `App.tsx` | Es la unidad natural de sustitución |
| Cómo llega el contrato a la shell | Inyección al instanciar | Permite versionar, testear con núcleo falso, no cierra futuros escenarios |
| Distribución | Mismo mecanismo que los plugins actuales | Es un tipo de extensión, no una categoría aparte |
| Piezas de administración | Provistas por el núcleo, montaje decidido por la shell | Ni se reimplementan ni se imponen |
| Shells activas a la vez | Una | Simplicidad; no hay caso de uso que lo exija hoy |

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El contrato sale moldeado sobre el modelo de tabs y la segunda shell no cabe | Esbozar la shell de dashboard (PRD 3) contra el contrato antes de darlo por cerrado |
| Fuga de lógica de dominio hacia la shell por defecto durante la migración | Regla explícita de RF-23; revisión dirigida a detectar accesos fuera de contrato |
| Fragmentación de experiencia si terceros publican shells | Documentar expectativas mínimas: acceso a configuración, cambio de shell, gestión de errores |
| Contrato que crece sin control al aparecer necesidades nuevas | Namespaces con madurez declarada; lo nuevo entra como experimental |

## 12. Fases

1. **Extracción del núcleo.** Sacar estado y lógica de `App.tsx` a un núcleo observable, sin cambios visibles.
2. **Contrato.** Definir `IShellObject`, su versionado y la inyección.
3. **Registro y carga.** Tipo de extensión, selección de shell activa, fallback.
4. **Shell por defecto.** Reimplementar tabs sobre el contrato. Aquí aparecen los huecos reales.
5. **Documentación.** Guía de autor de shells y ejemplo mínimo.

## 13. Abierto

1. ¿La shell activa se configura por usuario, por instalación, o por ambos con precedencia?
2. ¿Cómo se comporta el contrato si una extensión de shell y una de channel declaran versiones incompatibles entre sí?
3. ¿Las piezas de administración se montan como componentes o como rutas? Afecta a shells que no tengan router.
