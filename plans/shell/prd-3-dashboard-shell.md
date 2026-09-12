# PRD 3/3 — Shell de dashboard

**Estado:** borrador
**Autor:** Julio
**Componente:** nueva extensión de tipo shell
**Documentos relacionados:**
- PRD 1/3 — Shell: nuevo tipo de extensión
- PRD 2/3 — Variantes de presentación en channels

---

## 1. Qué se propone

Una segunda shell para Kwirth, orientada a monitorización continua en lugar de a investigación puntual: una **rejilla de celdas**, al estilo de Grafana, donde cada celda aloja una instancia de channel en la variante que el usuario elija.

Es la primera consumidora real del contrato de shell (PRD 1) y de las variantes de presentación (PRD 2). Además de ser un producto por sí misma, cumple una función de validación: si la rejilla encaja sobre `IShellObject` sin necesidad de ampliarlo con cosas específicas de dashboard, el contrato está bien planteado.

## 2. Por qué

Los dos perfiles de uso de Kwirth tienen necesidades opuestas:

- **Investigación:** foco en un recurso, máxima densidad, sesión corta. El modelo de tabs lo resuelve bien.
- **Operación:** varias fuentes a la vez, poca densidad por panel, sesión larga y a menudo desatendida. El modelo de tabs lo resuelve mal: obliga a ir saltando entre pestañas para ver el estado de conjunto.

## 3. Objetivos

- **O1.** Permitir componer una vista de conjunto con varias instancias de channel visibles simultáneamente.
- **O2.** Que esa composición sea persistente, exportable y compartible.
- **O3.** Que el usuario decida el grado de durabilidad de cada celda según el recurso que elija.
- **O4.** Validar el contrato de shell construyendo sobre la API pública, sin acceso privilegiado al núcleo.

### No-objetivos

- No se cambia el modelo de instancia: una celda es una instancia, equivalente funcionalmente a un tab actual.
- No se introduce agregación, filtrado ni muestreo en el backend.
- No hay edición colaborativa en tiempo real.
- No hay alertas ni notificaciones derivadas del contenido de las celdas.
- No sustituye a la shell de tabs; conviven.

## 4. Modelo

**Dashboard.** Una composición con nombre: una rejilla y un conjunto de celdas. Es la unidad que se guarda, se exporta y se comparte.

**Celda.** Una posición y tamaño en la rejilla, más una instancia de channel. La instancia se define por channel, destino y variante de presentación.

**Una celda equivale a un tab.** Mismo ciclo de vida, mismo stream, mismo coste. Lo único que cambia es la envoltura visual y la variante con la que se pinta.

- **RF-01.** Una celda aloja exactamente una instancia de channel.
- **RF-02.** Las instancias de distintas celdas son independientes entre sí, aunque apunten al mismo recurso.
- **RF-03.** La variante de presentación de una celda se elige de entre las que declare ese channel, y se fija al crearla.

## 5. Destino de una celda y durabilidad

La durabilidad de una celda es **decisión del usuario**, expresada a través del recurso que elige. Si apunta a un deployment, la celda sigue siendo válida con el paso del tiempo aunque cambien los pods que hay debajo. Si apunta a un pod concreto, la celda es tan efímera como ese pod. Kwirth no impone ni corrige esa decisión.

- **RF-04.** Una celda puede apuntar a cualquier nivel de recurso que el núcleo permita seleccionar.
- **RF-05.** El destino se persiste tal como el usuario lo definió, y se resuelve al cargar el dashboard.
- **RF-06.** Si al cargar un dashboard el destino de una celda no se puede resolver, esa celda se muestra en estado de error indicando el recurso ausente. El resto del dashboard carga con normalidad.
- **RF-07.** Al elegir el destino, la interfaz informa de la implicación de durabilidad de la elección, sin bloquearla.

## 6. Selección de recursos

El resource selector actual está diseñado como panel global permanente, lo que no encaja en esta shell: aquí cada celda tiene su propio destino, y la selección es un acto puntual dentro del modo edición.

- **RF-08.** Esta shell implementa su propia interfaz de selección de recursos.
- **RF-09.** Se invoca al crear una celda nueva, y al editar el destino de una existente.
- **RF-10.** Se apoya en las funciones de exploración y resolución de recursos que expone el núcleo. Esas funciones son **sin UI**: el núcleo aporta los datos, la shell aporta la presentación.
- **RF-11.** El mismo flujo cubre la elección de channel, destino y variante, porque las tres definen la instancia.

> **Dependencia del PRD 1:** el núcleo debe exponer exploración y resolución de recursos como funciones consultables, no atadas a la UI actual del selector. Si hoy esa lógica vive dentro del componente del resource selector, hay que extraerla durante la fase de extracción del núcleo.

## 7. Rejilla, modos y edición

- **RF-12.** Layout en rejilla de celdas, con celdas redimensionables y reordenables mediante arrastre.
- **RF-13.** El tamaño mínimo declarado por la variante (PRD 2) se respeta: no se permite reducir una celda por debajo de él.
- **RF-14.** El comportamiento de scroll declarado por la variante determina si la celda impone altura fija o crece con el contenido.
- **RF-15.** Dos modos: **edición**, con cromo de manipulación y creación de celdas; y **visualización**, sin cromo, pensado para pantalla desatendida.
- **RF-16.** En modo visualización no se puede alterar la composición de forma accidental.
- **RF-17.** Las celdas que no están visibles siguen las mismas reglas de ciclo de vida que un tab en segundo plano.

## 8. Persistencia, exportación y compartición

- **RF-18.** Un usuario puede tener varios dashboards con nombre.
- **RF-19.** Los dashboards se persisten en el backend, no solo en el navegador.
- **RF-20.** Un dashboard se puede exportar a fichero e importar en otra instalación de Kwirth.
- **RF-21.** Un dashboard se puede compartir con otros usuarios.
- **RF-22.** La importación valida que los channels y variantes referenciados existan, y reporta con claridad los que falten en lugar de fallar en bloque.
- **RF-23.** Un dashboard exportado no contiene credenciales ni datos observados: solo la composición.

### Compartición

Compartir introduce preguntas que no existen en la shell de tabs y que hay que resolver explícitamente:

- Qué ve alguien con quien se comparte un dashboard que apunta a recursos sobre los que no tiene permiso. La respuesta por defecto debe ser que la celda no muestra datos, no que el permiso se herede del autor.
- Si compartir entrega una copia o una referencia viva a la composición del autor.
- Quién puede editar un dashboard compartido.

- **RF-24.** Los permisos sobre los datos se evalúan siempre contra el usuario que visualiza, nunca contra el autor del dashboard.

## 9. Requisitos no funcionales

- **RNF-01.** La shell se implementa exclusivamente sobre `IShellObject`. Cualquier necesidad que obligue a puentearlo se resuelve ampliando el contrato en el PRD 1.
- **RNF-02.** Se define un límite razonable de celdas por dashboard y se avisa al usuario al acercarse a él.
- **RNF-03.** Un dashboard con muchas celdas debe degradar de forma predecible y avisar, no colapsar en silencio.
- **RNF-04.** Un error en una celda queda contenido en esa celda.
- **RNF-05.** Tras una reconexión, las celdas se recuperan sin intervención manual.

## 10. Coste

Cada celda es una instancia, y cada instancia es un stream. Veinte celdas son veinte streams. Una variante reducida ahorra espacio en pantalla, no tráfico: recibe lo mismo que la vista completa y muestra menos.

Esto se acepta a propósito para mantener el modelo simple y no tocar el backend. Las consecuencias de producto son un límite de celdas y un aviso al usuario. Si la escala llega a ser un problema real en uso, la solución no está en esta shell sino en permitir que una variante declare qué suscripción necesita, lo que afectaría al PRD 2 y al backend.

## 11. Decisiones ya tomadas

| Decisión | Resolución |
|---|---|
| Modelo de layout | Rejilla de celdas, estilo Grafana |
| Qué es una celda | Una instancia de channel, equivalente a un tab actual |
| Durabilidad del destino | Decisión del usuario según el recurso que elija |
| Selección de recursos | Interfaz propia de la shell, sobre funciones sin UI del núcleo |
| Cuándo se selecciona | Al crear celda nueva, en modo edición |
| Dashboards | Guardables, exportables y compartibles |

## 12. Abierto

1. ¿Compartir entrega copia o referencia viva?
2. ¿Hay dashboards de instalación, definidos por un administrador y visibles para todos?
3. ¿Se puede abrir una celda en un tab de la shell por defecto, o son mundos separados? Implicaría cambiar de shell activa llevando contexto.
4. ¿La rejilla es de columnas fijas con alto libre, o libre en ambos ejes?
5. ¿Qué ocurre con un dashboard que referencia un channel de un plugin desinstalado: se conserva la celda para cuando vuelva, o se elimina?
