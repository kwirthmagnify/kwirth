# Concesión de AI toolsets por tool — PRD

> **ESTADO — ✅ ENTREGADO** (2026-11-11). Documento de PRODUCTO: qué se hace y por qué. El cómo está en el
> [PLAN](PLAN.md).
>
> Antecedente: [ai-tools/PLAN.md](../../ai-tools/PLAN.md), sección *"El techo en dos fases"*. Esto amplía la
> **fase 1** (la concesión desde el toolset) y adelanta una pieza de la **fase 2** (*"el par aitoolset +
> tool como unidad de permiso"*), sin RBAC.

## El problema

Hoy un toolset se concede **entero o nada**: el admin elige en el gestor de AI toolsets qué plugins pueden
usarlo, y el plugin invitado recibe todas sus tools.

Eso obliga a elegir mal. Si un admin quiere que pinocchio pueda **escalar** un deployment pero no
**borrar** pods, ambas tools viven en `k8s-ops`: o le da las dos o no le da ninguna. Apagar la tool en la
configuración del canal no sirve como control, porque eso lo decide **quien configura el canal**, no el
admin — es preferencia, no permiso.

## Qué es

La concesión pasa de *"este plugin puede usar este toolset"* a *"este plugin puede usar **estas tools** de
este toolset"*.

```
efectivas = (toolsets concedidos)
          ∩ (tools concedidas de cada uno)        ← NUEVO, lo decide el admin
          ∩ (toolsets activos, en MI orden)
          − (tools apagadas por mí)
```

Se sigue gobernando **desde el toolset**, en una sola pantalla, por la misma razón que en la fase 1:
*"¿quién puede escribir en el cluster por IA?"* se tiene que responder mirando un sitio.

## Decisiones (usuario, 2026-11-11)

1. 🔴 **Dos formas de conceder, por plugin** (revisada el mismo día al empezar T1):
   - **Lista explícita**: se concede lo que se marcó y nada más. Si una versión nueva del toolset trae
     tools nuevas, **no entran** hasta que el admin las conceda.
   - **Switch "All"**: todas las tools del toolset, **incluidas las que traiga una versión futura**.
     Con el switch encendido la lista se ignora pero se conserva, y al apagarlo vuelve la selección previa.
2. **Tipo nuevo** en `common-ai` (validado):
   ```ts
   export interface IToolsetGrant {
       pluginId: string
       allTools: boolean   // every tool, future ones included; `tools` is then ignored (but kept)
       tools: string[]     // short tool names granted; [] = nothing
   }
   ```
   Lo persistido pasa de `Record<toolsetId, pluginId[]>` a `Record<toolsetId, IToolsetGrant[]>`.
3. **Sin migración.** El formato antiguo del ConfigMap `kwirth-aitoolsets-grants` no se lee: tras
   actualizar, las concesiones hay que rehacerlas. Esto incluye los Kwirth de clientes con agora y
   pinocchio — se anuncia en las notas de la versión.

## Comportamiento

- **Una tool no concedida no existe para ese plugin**: no se ofrece al modelo y **no hace sombra**. Si
  `ts1/td` no está concedida y `ts2` trae otra `td`, aparece la de `ts2` — igual que ya pasa con
  `disabledTools`.
- **Se reporta aparte.** `IToolResolution` gana `notGrantedTools` (referencias `'<toolset>/<tool>'`),
  separado de las apagadas y de `notGranted` (toolset entero no concedido). *"Te la ha quitado el admin"*
  y *"la has apagado tú"* se arreglan en sitios distintos.
- **La ejecución filtra por el mismo camino**: `buildAgentTools` ya construye desde `resolveTools(config,
  requesterId)`, así que el modelo no puede invocar lo que no se le ofreció. `invokeToolRef` no recibe
  solicitante y hoy no lo usa ningún consumidor; se documenta que no es una puerta.
- **Tools huérfanas**: si una versión nueva del toolset elimina o renombra una tool concedida, el nombre se
  queda en la concesión, se ignora al resolver y la UI lo marca.
- **Desinstalar** sigue llevándose la concesión (`unregisterToolset`); **reinstalar/actualizar** la
  restaura tal cual estaba guardada (`restoreGrants`), sin añadir las tools nuevas.
- **Portabilidad**: el bundle de configuración exporta e importa el formato nuevo.

## UI

El `PluginMultiSelect` del gestor genérico de extensiones lo comparten todos los tipos y **no se toca**.
Para los AI toolsets se sustituye por un **diálogo de concesión por toolset**:

```
┌ Grant: k8s-ops ─────────────────────────────────────────────────────────┐
│              │ All  │ scale_deployment │ restart_deployment │ delete_pod │
│              │      │      write       │       write        │   write    │
├──────────────┼──────┼──────────────────┼────────────────────┼────────────┤
│ pinocchio    │ ( o) │       [x]        │        [x]         │    [ ]     │
│ agora        │ (o ) │       [■]        │        [■]         │    [■]     │
│ geppetto     │ ( o) │       [ ]        │        [ ]         │    [ ]     │
                 switch; with it on the boxes show ticked and disabled
└──────────────┴─────┴──────────────────┴────────────────────┴────────────┘
                                                   [Help] [Cancel] [Save]
```

- Plugins en filas, tools en columnas con su chip de *effect*; columnas de **ancho fijo**, y si no caben,
  scroll **dentro** del diálogo.
- La tarjeta del toolset en el gestor resume la concesión (p. ej. `2 plugins`), en lugar del desplegable.
- Por defecto, todo desmarcado: instalar sigue sin conceder nada a nadie.

## Consumidores

- **pinocchio** (core): su lista de tools ya sale de `resolveTools(…, PINOCCHIO_ID)`, así que las no
  concedidas simplemente no aparecen (corregido en el PLAN: no se pintan en gris). Solo sube `common-ai`.
- **agora** (de pago): cambia la firma de las concesiones y aparece `notGrantedTools`. ⚠️ Es otro producto
  con su ciclo; se avisa, no se toca desde aquí.
- Guía: la sección del gestor de AI toolsets.

## Fuera de alcance

- RBAC por usuario/accessKey sobre tools (fase 2 de ai-tools).
- Cuentas de servicio.
- Conceder a nivel de plugin + instancia de canal: se concede al plugin, como hoy.
