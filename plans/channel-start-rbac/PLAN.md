# RBAC del arranque de canales · PLAN

> Cambio de **core** más auditoría de los 16 plugins. Afecta a la autorización, así que su riesgo no es
> romper una pantalla: es dejar usuarios fuera o dejar puertas abiertas.
> Estado: **decisiones cerradas 2026-09-11**, implementación **después de F2 de sugarless**.
> Origen: al cablear la view `none` se preguntó si un usuario sin scopes puede arrancar un canal. La
> respuesta es **sí**, y no solo el nuevo.

---

## 1. El agujero, verificado sobre el código

En el arranque de un canal, el core valida **tres** cosas y ninguna es el scope:

| Dónde | Qué comprueba |
|---|---|
| `back/src/index.ts:1114` | Que la accessKey **exista** y sea válida (API key conocida o bearer firmado). Nada más. |
| `back/src/index.ts:1180` | `loginKey.enabledChannels`: lista de canales permitidos al usuario. `undefined` = todos. |
| `processStartInstanceConfig`, rama `cluster` | **Nada.** Loguea *"A cluster-wide access key has been received"* y llama a `addObject('*all','*all','*all')` sin pasar por `checkAkr`. |

`checkAkr` —que es quien compara `haveLevel >= requestedLevel`— solo se invoca en el camino de
**recursos** (resolución de pods) y en los endpoints HTTP (`validAuth`). Los canales de view `cluster`
no pasan por ahí. Y la rama del canal autónomo que se añadió con la view `none` tampoco: hereda
exactamente el mismo gate, así que **no empeora nada**, pero tampoco mejora.

**Consecuencia: cualquier accessKey válida arranca cualquier canal cluster-scoped**, salvo que
`enabledChannels` lo impida.

### Cuántos plugins se protegen solos: 4 de 16

| Con comprobación interna | Sin ninguna |
|---|---|
| `agora` (10), `excubitor` (2), `ops` (1), `trivy` (1) | `echo`, `news`, `log`, `fileman`, `alert`, `topology`, `mirc`, `censor`, `pinocchio`, `provider-debug`, **`iter`**, **`montag`** |

`iter` y `montag` son **productos de pago** y hoy los arranca cualquier clave válida. Eso es el
hallazgo que justifica este plan por sí solo, independientemente de sugarless.

> **Corrección de lo dicho antes.** En una versión anterior del análisis se afirmó que conceder el
> scope `none` habilitaba de golpe `echo`, `agora`, `iter` y `provider-debug`. Es falso: el nivel
> exigido lo fija el `getScope()` de cada canal (agora e iter piden `CLUSTER`), y además en estos
> canales el scope **no se evalúa**. Ver `plans/instance-view-none/PLAN.md` §1.

---

## 2. El segundo bug: las escaleras están desconectadas

Esto es lo que impide "encender el chequeo y listo". Los plugins que declaran catálogo RBAC devuelven,
en cambio, la escalera del **core**:

```
agora.getScopeCatalog()      → agora$user, agora$read, agora$write, agora$admin
agora.getChannelScopeLevel() → ['', 'none', 'cluster']        ← no conoce sus propios scopes
```

Si el core empezara a exigir el scope **hoy mismo**, para agora:

- una clave con `agora$user` → `indexOf('agora$user')` en `['', 'none', 'cluster']` = **−1** → **denegada**
- una clave con `cluster` → nivel 2 → **permitida**

Exactamente al revés de la intención. Hay que revisar lo mismo en `excubitor`, `ops` y `trivy`.

---

## 3. Decisiones cerradas (2026-09-11)

| # | Decisión | Por qué |
|---|---|---|
| 1 | La comprobación va en el **core**, no por convención en cada plugin | 12 de 16 no la implementaron. Una regla que depende de que cada autor se acuerde es la que ya tenemos, y además cubre a los plugins de terceros que no controlamos. |
| 2 | **No** se añade un `$start` universal. El scope mínimo que ya declara cada plugin **es** su scope de arranque | Para agora el mínimo es `agora$user` ("entrar en salas y chatear"). Un `agora$start` por debajo concedería abrir una pestaña que no puedes usar: un permiso que no compra nada y uno más que olvidar asignar. |
| 3 | `none` = **nivel 0** = lo arranca cualquier clave válida, sin concesión | Es el concepto de "canal público", que es lo que se quiere para una demo como sugarless. Sin esto, un usuario sin scopes no podría arrancar ni un canal `none`, porque una cadena de scopes vacía ya da nivel 0 y `none` estaba en el 1. |
| 4 | Un canal **sin** `getScopeCatalog()` sigue abierto | Es lo único que permite encender el chequeo sin dejar fuera a los usuarios actuales ni romper plugins de terceros. Cada plugin se cierra el día que declara sus scopes, y cerrarlo es entonces un acto deliberado. |
| 5 | Se implementa **después** de F2 de sugarless | Sugarless no depende de esto: declarará `none` y será público a propósito. |

---

## 4. Cambios

### 4.1 Core

1. Extraer de `checkAkr` la comparación de niveles a algo invocable **sin recursos** (hoy va pegada al
   `checkResource` de namespace/pod/container, que en estos canales no aplica).
2. Llamarla en la rama de view `cluster` **y** en la del canal autónomo.
3. `none` pasa a ser el nivel 0 de la escalera, para que una clave sin scopes lo satisfaga (decisión 3).
4. Si el canal no declara `getScopeCatalog()`, no se exige nada (decisión 4).

### 4.2 Conectar las escaleras de los 4 que declaran catálogo

Para cada uno: `getChannelScopeLevel` tiene que usar **su propia** escalera, y `getScope()` devolver su
**scope mínimo** en vez de `CLUSTER`.

- `agora`: escalera `AGORA_SCOPE_LADDER`, `getScope()` → `agora$user` (hoy `CLUSTER`).
- `excubitor`: ya usa `EXCUBITOR_SCOPE_LADDER` en `getChannelScopeLevel`; revisar su `getScope()`.
- `ops` y `trivy`: revisar ambos.

**Esto va en la misma fase que 4.1, no después.** Encender el chequeo sin conectar las escaleras
rompería agora en el acto, del modo descrito en §2.

### 4.3 Auditoría de los 12 sin catálogo

Decidir, uno a uno, si necesita scopes propios. **Prioridad: `iter` y `montag`**, que son de pago y hoy
están abiertos. El resto puede quedarse abierto mientras sea una decisión escrita y no un olvido.

---

## 5. El riesgo de verdad: dejar usuarios fuera

El día que un plugin declara su catálogo, **las accessKeys ya emitidas no llevan sus scopes**, así que
sus usuarios se quedan fuera de golpe. La decisión 4 acota el radio: no es un apagón global, es un
plugin cada vez.

Por tanto el orden para cerrar un plugin es, siempre: **primero** asignar los scopes en el editor de
seguridad, **después** declarar el catálogo. Nunca al revés. En dev no importa (el estado se borra),
pero esto llega a instalaciones reales.

---

## 6. Fases

**F1 — Core + las 4 escaleras.** §4.1 y §4.2 juntos, que por separado rompen. MVP: una clave sin
scopes deja de arrancar agora, y una con `agora$user` sí lo arranca.

**F2 — Los dos de pago.** Catálogo de scopes para `iter` y `montag`, con sus scopes asignados antes de
declararlos.

**F3 — Los 10 restantes.** Decisión escrita por plugin: cerrar o dejar abierto a propósito.

**F4 — Documentación y e2e.** La guía de administración de cada plugin de pago mantiene su RBAC, así
que toca las suyas.

---

## 7. Verificación

Los tres casos que tienen que quedar asertados en e2e, porque son los que hoy fallan:

- [ ] Una clave **sin scopes** NO arranca agora (hoy sí).
- [ ] Una clave con **`agora$user`** SÍ lo arranca (hoy, con el chequeo encendido, sería denegada).
- [ ] Una clave con **solo `cluster`** NO lo arranca (hoy pasaría, y es lo contrario de lo que se quiere).
- [ ] Una clave sin scopes SÍ arranca un canal que pide `none` (el caso de sugarless).
- [ ] Un canal sin catálogo sigue arrancando como hoy.
