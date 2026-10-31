# PRD · Un canal cuyo front llega tarde no aparece en el selector

> **Estado**: hallazgo verificado, sin empezar · **Fecha**: 2026-10-30 · **Ámbito**: core (`front/src/App.tsx`)

## El hallazgo

El selector de recursos ofrece los canales que calcula `setUsablechannels(cluster)` (`front/src/App.tsx`):
los que anuncia el back del cluster **filtrados por los que ya tienen front cargado** (`frontChannels`).

El cálculo se hace **una vez**, al elegir cluster (`onChangeCluster`) o al terminar de leer su info. No se
repite cuando `frontChannels` cambia. Si el bundle de front de un plugin llega **después** de elegir el
cluster, su canal queda fuera de la lista hasta que el usuario elige otra vez el cluster. No sale ningún
error ni aviso: el canal no está y ya.

## Cómo apareció

En el e2e de un plugin de pago, en un dev cargado (2026-10-30). Los bundles de los plugins de pago tardaban
más que el login. El spec elegía el cluster nada más entrar, el selector de canal salía **sin la opción**, y
ningún timeout del test lo arreglaba porque la lista no se iba a recalcular nunca. El e2e lo esquiva
esperando a que el bundle se haya registrado en `window.__kwirth_plugins__` antes de elegir el cluster.

A una persona le pasa lo mismo si elige cluster muy deprisa tras el login: busca un canal instalado y no está.

## Qué tendría que ser verdad al cerrarlo

- La lista de canales del selector se recalcula cuando cambia `frontChannels` (un `useEffect` sobre
  `frontChannels` y el cluster elegido, o calcularla al renderizar en vez de guardarla en estado).
- Un canal cuyo front llega tarde aparece en el selector sin que el usuario tenga que tocar nada.
- Los e2e pueden quitar la espera a `__kwirth_plugins__` que hoy esquiva el problema.
