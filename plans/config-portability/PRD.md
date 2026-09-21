# Portabilidad de configuración — PRD

> **ESTADO — PRD, sin código.** Documento de producto: qué se quiere y por qué. El desglose técnico irá
> a `PLAN.md` cuando esto se valide. Abierto el 2026-09-21 sobre Kwirth 0.6.31.

## El problema

Montar un Kwirth es rápido. Dejarlo **configurado** no: marketplaces y registros con sus credenciales,
una docena de extensiones instaladas, los destinatarios de cada sender, las instancias de IdP, los
grants de los toolsets de IA, las reglas de alerta de Excubitor, las salas de Agora. Todo eso se hace a
mano, pantalla a pantalla, y hoy **no hay forma de llevárselo a otro Kwirth**.

Eso duele en cuatro situaciones que ya se dan:

- **Promoción entre entornos.** Lo que se afina en el clúster de pruebas hay que repetirlo, clic a clic,
  en el de producción. Cada repetición es una oportunidad de que los dos dejen de parecerse.
- **Alta de un clúster nuevo.** Una organización con varios clústeres quiere el mismo Kwirth en todos.
- **Recuperación.** Si se pierde el namespace, se pierde la configuración; los artefactos se reinstalan
  desde el marketplace, pero lo que había dentro de ellos no.
- **Soporte y demos.** Reproducir la instalación de alguien —o entregar una preconfigurada— exige hoy
  un documento con instrucciones.

## La restricción que manda sobre todo el diseño

**El core no sabe dónde vive la configuración de una extensión, y no puede saberlo.**

Parte de la configuración sí está en claves de ConfigMap y Secret que el core gestiona. Pero los plugins
con back propio guardan la suya donde quieren, y los dos plugins más grandes la guardan **en su propio
Postgres**. Peor aún: en esa base de datos la configuración y los datos de trabajo están mezclados, y
solo el plugin sabe cuál es cuál.

| plugin | en su Postgres es **configuración** | en el mismo Postgres son **datos** |
|---|---|---|
| Excubitor | `alert_rules`, `azure_mapping`, `azure_profile` | `alert_history`, `acceptance_request`, findings |
| Agora | `agora_rooms`, `agora_members`, `agora_invites` | `agora_messages`, `agora_receipts`, `agora_incident`, `agora_metric_baseline` |

Ninguna heurística del core separa eso. Ni siquiera tiene acceso a esa base de datos.

## El reparto de responsabilidades

Todo el diseño sale de esa restricción, y conviene fijarlo antes que nada porque es lo que evita que
esta feature se convierta en un monstruo en el core:

| quién | qué decide |
|---|---|
| **La extensión** | **Todo lo que tenga que ver con el contenido.** Qué es configuración suya y qué son datos; qué exporta; y, al recibir un import, con qué se queda y qué descarta. |
| **El core** | **Nada del contenido.** Reúne lo que le dan las extensiones, lo mete en un fichero, y en el otro extremo lo lee, localiza a cada destinatario y le entrega su parte. |
| **Quien usa Kwirth** | **Qué entradas viajan.** Marca en el origen qué se exporta y en el destino qué se aplica. |

> El core es **transporte**, no autoridad. No interpreta, no valida el contenido, no decide si algo
> reemplaza o se fusiona, no instala nada.

Esto es lo que hace que la feature no crezca sin control: el día que exista un plugin nuevo con un
almacenamiento que hoy no imaginamos, el core no se entera y no hay que tocarlo.

## Qué se quiere

Un **único fichero** que se saca de un Kwirth y se mete en otro, con la elección de **qué** entra en
cada extremo: se marca en el origen lo que se exporta y se marca en el destino lo que se importa.

### La granularidad es la extensión, y es deliberada

**Todo o nada por extensión.** Se elige si Excubitor entra o no; no se elige *qué parte* de Excubitor
entra, ni el core ofrece pantallas para hurgar dentro de una extensión.

Es una decisión de producto: en cuanto el core permite importar media configuración, el resultado es un
estado que **nadie ha tenido nunca** — ni el origen ni el destino —, imposible de reproducir y de
soportar. Y sería además un core opinando sobre un contenido que no entiende.

Lo que sí puede pasar dentro de una extensión es que **ella** descarte parte de lo que recibe: porque no
le cuadra, porque referencia cosas que en este clúster no existen, o porque viene de una versión
anterior. Eso no es el core troceando; es la extensión ejerciendo de autoridad sobre lo suyo.

### Decisiones tomadas

| decisión | elegido | por qué |
|---|---|---|
| **Quién decide qué es configuración** | **la extensión**, vía una interfaz común `IExtension` | Es la única que lo sabe, y el core necesita preguntárselo igual a las once familias. |
| **Qué hace el import si falta la extensión** | **avisa e ignora esa entrada** | El core no instala. Instalar significaría alcanzar un marketplace, resolver licencias de artefactos de pago, esperar arranques y reinicios: un proceso frágil metido en medio de otro. Que lo instale quien quiera y reimporte. |
| **Contenido del fichero** | configuración **+ referencia** al artefacto (id, tipo, versión, marketplace de origen) | La referencia no sirve para instalar, sino para **saber qué falta** y con qué versión se generó. |
| **Credenciales** | casilla **"Include credentials"** al exportar | Es el patrón que el usuario ya conoce de los ajustes globales, donde ya está implementado. Sin marcar, los campos secreto viajan vacíos y el destino lista cuáles hay que rellenar. |
| **Del core** | solo los **ajustes globales** | API keys, usuarios/RBAC y workspaces **quedan fuera**: son identidad y datos de trabajo de una instalación concreta, no su configuración. |

## Qué NO es

- **No es sincronización.** Es una copia puntual que alguien dispara y revisa, no dos Kwirth que se
  mantienen iguales solos.
- **No es una copia de seguridad.** No incluye datos de trabajo: ni mensajes de Agora, ni findings de
  Excubitor, ni workspaces, ni histórico.
- **No es un instalador.** No despliega extensiones; configura las que ya están.
- **No clona accesos.** Sin API keys ni usuarios, el destino conserva su propia identidad. Un fichero
  robado no abre la puerta de nadie.
- **No migra entre versiones.** El fichero registra la versión de origen y el core la muestra; si hay
  que transformar algo, lo hace la extensión al importar, o no se hace.

## El contrato: `IExtension`

Hoy cada tipo de extensión tiene su propio contrato —un canal no se parece a un provider, ni un sender a
un IdP— y **no hay nada común entre ellos**. Eso es justo lo que falta aquí: el core necesita poder
pedirle lo mismo a cualquier extensión sin saber de qué tipo es.

La respuesta es una interfaz **transversal**, `IExtension`, en `common-back/src` —junto a `IChannel`,
`IProvider`, `ISender`, `IWebhook` e `IIdpConnector`, que es donde viven los contratos de back—, y que
todos ellos extienden. Nace con dos métodos, **ambos opcionales**:

- **`exportConfig(opts)`** — devuelve su configuración como JSON. La extensión decide qué entra: leyendo
  su Postgres, su almacén en ConfigMap, o de donde sea. `opts` dice si se incluyen credenciales.
- **`importConfig(data)`** — recibe exactamente eso y **decide qué hacer con ello**: qué acepta, qué
  descarta, qué reemplaza y qué conserva de lo que ya tenía. Devuelve un resumen de lo que ha hecho,
  que es lo que el core enseña al final.

Que sea una interfaz común y no un método suelto por tipo tiene dos consecuencias más allá de esta
feature: el core trata a las once familias con el mismo código, y `IExtension` queda como el sitio
natural donde poner lo siguiente que toda extensión deba saber hacer —hoy es portabilidad, mañana puede
ser diagnóstico o salud—.

### Opcional, y esto es lo que hace la feature entregable

**Implementar `IExtension` no es obligatorio y nada se rompe por no hacerlo.** Los métodos son
opcionales en la interfaz, el core comprueba si la extensión los trae, y una extensión ya publicada
sigue funcionando exactamente igual: **sin tocarla, sin bump, sin republicar**.

Sin eso, la feature no podría entregarse hasta haber republicado todas las extensiones a la vez —
incluidos los siete de pago— y quedaría atada a la ola más lenta. Siendo opcional, el core se entrega
primero y las extensiones se suman de una en una, cada una en su ciclo de versión. Cada adopción hace el
fichero más completo; ninguna es requisito de las demás.

Lo opcional es **adoptarla**, no cumplirla: quien la implementa, implementa los dos métodos y responde
de su idempotencia. Y opcional no significa que el core supla la ausencia: **no hay fallback**. Si el
core copiase por su cuenta las claves que conoce de Excubitor, produciría un fichero que *parece*
llevarlo y llega al destino sin una sola regla de alerta. Un hueco declarado es mejor que un engaño.

⚠️ **Los tipos sin código no pueden implementarla.** Un `theme`, un `login`, un `docs`, una `homepage` o
un `pack` son datos, no ejecutan nada: su configuración la aporta el core, que es quien la gestiona. El
contrato aplica a quien tiene back —`plugin`, `provider`, `sender`, `webhook`, `idp`, `aitoolset`—, y el
diálogo no debe presentar como carencia lo que es una imposibilidad.

## Cómo se ve

### Exportar

Un diálogo con la lista de lo exportable —las extensiones que implementan el contrato, más lo que
aporta el core—, **todo marcado por defecto**:

```
Export configuration                                    [ ] Include credentials

  CORE
    [x] Global settings            marketplaces (3), registries (2), metrics interval
    [x] Shared AI configuration    4 providers, 7 models

  EXTENSIONS
    [x] plugin/excubitor    0.9.2   (1 credential)
    [x] plugin/agora        0.1.55
    [x] sender/email        0.3.1   (3 credentials)
    [x] idp/keycloak        0.1.3   (2 credentials)
    [ ] theme/santander     0.2.0
        plugin/situs        0.5.1   — does not support export
                                                      [Export]  [Cancel]
```

El core no describe lo que hay dentro de cada extensión, porque no lo sabe: eso lo resume la propia
extensión si quiere. Lo que sale es **un JSON legible**, para poder revisarlo, versionarlo en un
repositorio o editarlo a mano. Lleva metadatos de procedencia: versión de Kwirth, fecha y origen.

### Importar

El core lee el fichero **de donde se le diga** —subido a mano hoy; una URL o una ruta el día que esto
se use desde un pipeline— y muestra sus entradas antes de tocar nada:

```
Import configuration                              from: prod-cluster · 2026-09-21 · Kwirth 0.6.31

  CORE
    [x] Global settings          will be applied
    [x] Shared AI configuration  will be applied

  EXTENSIONS
    [x] plugin/excubitor  0.9.2   installed 0.9.2
    [x] sender/email      0.3.1   installed 0.3.0    ⚠ different version
    [ ] idp/keycloak      0.1.3   NOT INSTALLED      -> will be skipped
    [ ] plugin/agora      0.1.55  installed, does not support import  -> will be skipped

  ⚠ 5 credentials come empty and must be filled after importing.
                                                          [Import]  [Cancel]
```

Y entonces, por cada entrada marcada, el core hace **solo esto**:

1. Busca la extensión referenciada.
2. Si **no está instalada** → avisa y la ignora.
3. Si está pero **no implementa `importConfig`** → avisa y la ignora.
4. Si está y lo implementa → le pasa su parte y recoge lo que responda.

Al final enseña el informe: qué entró, qué dijo cada extensión que hizo, y qué se ignoró y por qué. Que
una entrada se ignore **no detiene las demás**: nunca hay un import que se queda a medias porque una
pieza no estaba.

## Riesgos y casos que hay que mirar de frente

- **Adopción: hoy no lo implementa nadie, y los primeros ficheros llevarán poco.** Al ser opcional esto
  no bloquea la entrega, pero sí hay que asumirlo: el riesgo no es técnico sino de expectativa —alguien
  lee "exportar configuración" y espera que salga todo—. La UI tiene que dejar clarísimo qué **no** va
  dentro, y la guía decir que la lista crece con cada extensión que se actualiza.
- **No toda extensión instalada tiene a quién preguntar.** Los senders y los webhooks mantienen
  instancias vivas, pero de los canales solo se instancian los `requiredChannels` que no sean `REMOTE`:
  un plugin instalado cuyo canal no esté activo en este Kwirth **no tiene instancia** a la que pedirle
  su configuración. Hay que decidir si se instancia una temporal para preguntarle —con el riesgo de
  despertar un constructor con efectos— o si se declara como no disponible, que es lo coherente con el
  resto del diseño. Es la decisión técnica más espinosa y va al PLAN.
- **Un import que no hace nada visible.** Si el destino no tiene instaladas las extensiones del fichero,
  el resultado legítimo es "ignorado todo". Tiene que quedar claro que eso no es un fallo del import,
  sino que faltan extensiones — y cuáles, con su versión y su marketplace de origen.
- **Configuración que referencia cosas del origen.** Los miembros de una sala de Agora son usuarios; un
  `azure_profile` de Excubitor apunta a un `cluster_uid`; un filtro puede nombrar un namespace. En el
  destino puede que nada de eso exista. Lo resuelve la extensión al importar —descartando o
  avisando—; el core no puede juzgarlo y no lo va a intentar.
- **El destino puede no tener sitio.** Lo que una extensión escribe al importar acaba en el
  almacenamiento del destino, que puede tener techo (800 KB por objeto en ConfigMaps de Kubernetes; ver
  `storeLimit()`). Una configuración que cabía en el origen —en disco— puede no caber aquí. La
  extensión debe reportarlo, no fallar en silencio.
- **Un fichero con credenciales es un secreto.** Se descarga a la carpeta de descargas de alguien. La
  casilla va **desmarcada por defecto** y el fichero declara en sus metadatos que las lleva.
- **Contenido no fiable.** El fichero es editable a mano, y eso es deseable. Significa que
  `importConfig` recibe algo que **no** puede dar por válido: validar lo que llega es parte del
  contrato, no un detalle de implementación.

## Criterios de aceptación

1. Exportar desde un Kwirth con todo instalado produce un JSON legible que **no contiene ni una
   credencial** si la casilla está desmarcada.
2. Importarlo en otro Kwirth con las mismas extensiones instaladas lo deja configurado igual, salvo lo
   que se dejó sin marcar.
3. Exportar → importar sobre el **mismo** Kwirth no cambia absolutamente nada (idempotencia), y se
   verifica **por extensión**, no solo en conjunto.
4. Con una extensión del fichero **no instalada** en destino: se avisa, se ignora esa entrada y **todas
   las demás entran**.
5. Con una extensión instalada que **no implementa** el contrato: mismo comportamiento, con un aviso que
   distingue las dos causas.
6. Una extensión que no implementa el contrato aparece declarada como tal en ambos diálogos, y su
   ausencia nunca se confunde con "no tenía configuración".
7. **Una extensión ya publicada, sin tocar ni republicar, sigue funcionando igual que hoy** — instalar,
   configurar y usar — con el core nuevo desplegado. Es la condición que permite ir poco a poco.
8. Con Excubitor y Agora adaptados: el destino recibe sus reglas de alerta y sus salas, y **no recibe**
   ni un finding ni un mensaje.
9. La vista previa del import coincide con lo que realmente ocurre: ninguna sorpresa después de pulsar.

## Preguntas abiertas

- **¿Nace `IExtension` solo con export/import, o con más?** Va a ser la primera interfaz común a las
  once familias, y añadirle algo después obliga a tocarlas todas otra vez. Merece decidir ahora si
  entran también identidad (`id`, `version`, `type`) y ciclo de vida, aunque hoy cada tipo los resuelva
  por su cuenta — sin convertirlo en un rediseño que bloquee esta feature.
- **¿Qué forma tiene el resumen que devuelve `importConfig`?** Es lo único que el core enseña del
  contenido, así que conviene que sea igual para todas: un recuento y una lista de avisos parece
  suficiente, pero hay que fijarlo antes de la primera implementación.
- **¿Por dónde empieza la adopción?** Los tipos que ya tienen algo parecido (`idp`, `sender`, `webhook`)
  salen casi gratis, pero **Excubitor o Agora deberían estar entre los primeros aunque cuesten más**:
  son los que demuestran que el contrato aguanta un back con base de datos propia, que es justo lo que
  todavía no sabemos.
