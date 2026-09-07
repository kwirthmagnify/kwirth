# Diálogos de gestión de extensiones — criterio de UI

Los **once** diálogos de gestión (plugins, providers, senders, themes, homepages, IdP, logins, webhooks,
packs, documentación) enseñan lo mismo con distinto contenido, así que tienen que **verse igual**. Cada vez
que uno se toca de forma aislada, aparece deriva: durante meses la mitad tenía una cosa y la otra mitad
otra, y solo se detectó revisándolos los diez a la vez.

Este documento fija el criterio. **Antes de dar por terminado un cambio en uno, comprobarlo en los once.**

## Status (2026-09-07) — CRITERIO APLICADO Y VERIFICADO

## Las reglas

### 1. Instalados y disponibles se ven igual

Las dos secciones muestran la misma información en el mismo sitio; lo único que cambia es la acción
(configurar/desinstalar frente a instalar) y lo que solo tiene sentido en una de ellas.

Seis diálogos (plugins, themes, homepages, logins, packs, docs) usan una **card compartida** entre ambas
secciones y por eso no derivan. Los otros cinco tienen el JSX duplicado: ahí es donde hay que mirar dos
veces.

### 2. Procedencia siempre: en las dos secciones **y en las dos vistas**

`MarketplaceSourceIcon` + `MarketplaceBadge` (`components/MarketplaceBadge.tsx`). En el catálogo es donde
más importa: con la precedencia por id, dos marketplaces pueden publicar el mismo `log` y el badge es lo
único que los distingue.

Son **veinte** sitios: 11 diálogos × instalados/disponibles × card/lista. Se corrigió en dos tandas porque
la primera solo miró las tarjetas: al pasar a lista, la procedencia desaparecía en las diez listas de
instalados. Al auditar, **contar 20**, no 10.

Una extensión de **dev**, de **fichero local** o descargada de una **URL suelta** no viene de ningún
marketplace: icono de consola y **ningún chip**. Sin esa excepción, el badge las etiquetaba como
"Kwirth" — anunciando como público un artefacto de pago cargado en dev.

### 3. La versión se elige en el catálogo, se muestra en lo instalado

En las tarjetas y filas de **disponibles**, un `Select` **siempre**, aunque solo haya una versión: si
aparece y desaparece según el catálogo, las tarjetas bailan. En **instalados** no hay nada que elegir, así
que va un `Chip`. En las cards compartidas eso es `versions ? <Select> : <Chip>`.

### 4. Todos los chips, compactos

`compactChip` (exportado por `MarketplaceBadge.tsx`) en **todos** los chips de una tarjeta o fila. Mezclar
tamaños en la misma fila se ve desordenado, y en la vista de lista canta el doble.

### 5. El conmutador card/lista vale para las dos secciones

Si una queda siempre en tarjetas, al pulsar "lista" media pantalla no cambia.

### 6. En la vista de lista, los chips se alinean a la derecha

Las listas son grids. Una columna `auto` toma el ancho de su contenido más ancho y lo de dentro se queda
pegado a la izquierda, así que un chip corto (`dev`) queda descolocado respecto a uno largo (`installed`).
Las celdas de chips llevan `justifySelf: 'end'`.

### 7. El texto no se abrevia distinto según la vista

Mismo chip, mismo texto: `N configs` en tarjeta y en lista, no `N cfg` en una y `N configs` en la otra.

## Auditorías

El criterio se comprueba con scripts, no a ojo: contar usos de `MarketplaceSourceIcon` por fichero, chips
sin `compactChip`, ternarios de `viewMode` por sección, y presencia de versión en cada vista de lista. Un
número que se sale de la fila delata al diálogo que ha derivado. Fue lo que dio el alcance real de cada
síntoma: lo que se reportó como "en providers pasa X" era X en cuatro, nueve o los diez.

## Capturas de la guía

`front/e2e/tests/capture-managers.spec.ts` las regenera. **Desactiva temporalmente los marketplaces
privados** (snapshot + restauración literal): la guía es pública y el catálogo del entorno de desarrollo
trae las extensiones de pago. Un cambio de UI en estos diálogos invalida esas capturas — punto 4 del CL9.
