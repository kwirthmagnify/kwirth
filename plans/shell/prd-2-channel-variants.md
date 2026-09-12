# PRD 2/3 — Variantes de presentación en channels

**Estado:** borrador
**Autor:** Julio
**Componente:** contrato de channel (`IChannel`), plugins existentes
**Documentos relacionados:**
- PRD 1/3 — Shell: nuevo tipo de extensión
- PRD 3/3 — Shell de dashboard

---

## 1. Qué se propone

Hoy un channel tiene una única forma de pintarse: a pantalla completa, dentro de un tab. Se propone que un channel pueda **declarar varias variantes de presentación** del mismo contenido, para poder alojarse en contenedores distintos de un tab.

El ejemplo que motiva el cambio: el channel de logs, además de su vista completa de stream, ofrece una vista reducida con los últimos errores y un contador por severidad.

Este PRD cubre solo la ampliación del contrato de channel. Es independiente de que exista o no una shell alternativa: un plugin puede querer una variante reducida aunque solo exista la shell de tabs. El consumidor natural, eso sí, es el PRD 3.

## 2. Objetivos

- **O1.** Que un channel declare, en su registro, qué variantes de presentación soporta.
- **O2.** Que cada variante lleve la metadata que un contenedor necesita para alojarla correctamente.
- **O3.** Que la shell pueda listar variantes **antes** de existir ninguna instancia, para componer la interfaz de alta.
- **O4.** Que el punto de entrada de renderizado no cambie, y que los channels existentes no requieran ninguna modificación.

### No-objetivos

- No se define ningún vocabulario cerrado de nombres de variante más allá de `default`.
- No se cambia el modelo de instancias: cada montaje sigue siendo su propia instancia, con su propio stream y su propio estado. Una variante es una forma de pintar, no una forma de compartir.
- No se introduce agregación ni filtrado en backend. Una variante recibe exactamente lo que recibe hoy el channel.
- No se especifica carga perezosa por variante.

## 3. Modelo

**La declaración vive en el registro del channel; el renderizado vive en la instancia.** Son dos superficies distintas y el momento en que se usan es distinto:

- La shell consulta al registro qué variantes ofrece un channel **al componer**, cuando el usuario va a añadir una vista y todavía no existe nada.
- La variante elegida se fija **al crear la instancia** y se le pasa al componente **al renderizar**.

- **RF-01.** El registro de channel expone un método que devuelve la lista de variantes soportadas, invocable sin ninguna instancia creada.
- **RF-02.** Todo channel soporta obligatoriamente la variante `default`, que corresponde a su vista actual a pantalla completa.
- **RF-03.** Los nombres de las demás variantes son libres: cada plugin define los suyos. Kwirth no reserva ni impone un vocabulario.
- **RF-04.** La variante seleccionada forma parte de la configuración de la instancia y no cambia durante su vida.

### Consecuencia de nombres libres

Con vocabulario libre, `default` es la única variante que un contenedor puede pedir a ciegas. Todo lo demás se compone: la shell enseña la lista que devuelve el registro y el usuario elige. No hay negociación automática ni fallback entre variantes con nombre distinto.

## 4. Metadata de variante

Cada variante declara:

| Campo | Para qué |
|---|---|
| Identificador | Clave estable, es lo que se persiste en la configuración de la instancia |
| Etiqueta legible | Lo que ve el usuario en el selector al componer |
| Descripción corta | Ayuda al usuario a distinguir entre variantes del mismo channel |
| Tamaño recomendado | Punto de partida al colocar la vista |
| Tamaño mínimo | Por debajo de ese tamaño la vista no es utilizable; el contenedor lo impide |
| Interactiva o solo visualización | Determina si tiene sentido en un contexto desatendido, y si el contenedor debe reservar área de interacción |
| Comportamiento de scroll | Si la variante gestiona su propio desbordamiento con altura fija, o se dimensiona según su contenido |

- **RF-05.** El contenedor no puede montar una variante por debajo de su tamaño mínimo declarado.
- **RF-06.** El contenedor usa el comportamiento de scroll declarado para decidir si impone altura fija o deja crecer a la vista.
- **RF-07.** La metadata es declarativa y estática: no depende del estado de la instancia ni del recurso observado.

## 5. Renderizado

- **RF-08.** El punto de entrada de renderizado del channel **no cambia**. Es el mismo componente que hoy.
- **RF-09.** La variante se le pasa a ese componente como parámetro.
- **RF-10.** El reparto entre variantes lo implementa el plugin dentro de su componente principal. Kwirth no impone estructura para ello.
- **RF-11.** Un channel que no declara variantes adicionales recibe siempre `default` y se comporta exactamente como hoy, sin cambios en su código.

La responsabilidad del reparto es del plugin. Si un plugin declara una variante y luego no la contempla en su reparto interno, el fallo es suyo: el contrato solo puede garantizar que no se pide una variante ausente del registro.

## 6. Variante ausente

El caso real de una variante que no existe no es la composición —la shell solo ofrece lo que el registro devuelve— sino la **restauración** de una configuración guardada después de que el plugin haya cambiado: una variante renombrada, retirada, o un plugin desinstalado.

- **RF-12.** Si se solicita una variante que el channel no declara, la instancia se rechaza. No hay caída automática a `default`.
- **RF-13.** El rechazo se comunica en pantalla, en el lugar donde debía aparecer esa vista, indicando el channel y el identificador de variante que falta.
- **RF-14.** El rechazo es local a esa vista. El resto de vistas de la sesión o del layout restaurado cargan con normalidad.

## 7. Compatibilidad

- **RNF-01.** La ampliación del contrato es aditiva. El método de listado de variantes es opcional; su ausencia equivale a declarar únicamente `default`.
- **RNF-02.** Ningún plugin existente requiere cambios para seguir funcionando.
- **RNF-03.** El contrato queda documentado con un ejemplo de channel que declara dos variantes.
- **RNF-04.** Se publica una guía de migración para autores que quieran añadir variantes a un channel existente.

## 8. Limitaciones conocidas

**El bundle de todas las variantes viaja junto.** Al implementarse el reparto dentro del componente principal del channel, no hay forma de separar el código de una variante que no se usa, salvo que el propio plugin haga carga perezosa por su cuenta. Se acepta a cambio de la simplicidad del contrato y de la migración nula. Si en el futuro una variante arrastra dependencias pesadas, se revisará permitiendo declarar componente por variante.

**Coste por vista.** Como cada montaje es su propia instancia, N vistas del mismo recurso son N streams. Una variante reducida no es más barata en transporte que la completa, solo más barata en pantalla. Es una decisión consciente del modelo y no se aborda aquí.

## 9. Decisiones ya tomadas

| Decisión | Resolución |
|---|---|
| Dónde se declaran las variantes | En el registro del channel, consultable sin instancia |
| Vocabulario de nombres | Libre, con `default` obligatorio |
| Punto de entrada de render | El mismo de hoy, con la variante como parámetro |
| Quién reparte entre variantes | El plugin, dentro de su componente principal |
| Variante inexistente | Rechazo con aviso en pantalla, sin fallback |
| Modelo de instancia | Una instancia por vista, sin compartir estado |

## 10. Abierto

1. ¿Se versiona el conjunto de variantes de un plugin, para poder distinguir "variante retirada" de "plugin antiguo"?
2. ¿La metadata de tamaño se expresa en unidades de rejilla o en píxeles? Depende de lo que decida el PRD 3, pero el contrato no debería atarse a una rejilla concreta.
3. ¿Debe el registro permitir marcar una variante como obsoleta, para que deje de ofrecerse al componer pero siga restaurando configuraciones existentes?
