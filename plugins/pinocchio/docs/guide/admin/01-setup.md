# Instalación

Pinocchio es un plugin de tipo **canal**. Se instala como cualquier otro plugin de kwirth, pero tiene una
dependencia dura y una condición previa que conviene resolver antes de que los usuarios abran el canal.

## Requisitos

| Requisito | Detalle |
|-----------|---------|
| Provider `business` | **Obligatorio.** El manifiesto declara `requiresExtension: ["provider:business:0.1.6"]`. kwirth no deja instalar el plugin sin él. |
| Providers `events` y `metrics` | Los aporta el core. No hay nada que instalar. |
| Almacenamiento del canal | El canal declara `storage: true`: kwirth le da un almacén donde guarda la clave `pinocchio-config`. |
| Un provider de IA y un LLM | **No es un requisito de instalación, pero sí de uso.** Sin ellos el canal arranca y no sirve para nada. Ver [Providers y modelos de IA](02-ai-config.md). |
| Tipo de clúster | El canal declara `sources: [KUBERNETES]`. No funciona sobre orígenes que no sean Kubernetes. |

**Reinicio:** el manifiesto declara `requiresRestart: false`. Instalarlo o actualizarlo no obliga a reiniciar
el backend de kwirth.

## Instalar en producción

Desde la UI de administración de kwirth, en el gestor de plugins: búscalo en el marketplace, o instálalo
desde la URL del tarball publicado:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-pinocchio/-/kwirth-plugin-pinocchio-<version>.tgz
```

Instala **antes** el provider `business`; si no, la instalación del plugin se rechaza por dependencia no
satisfecha.

## Instalar en desarrollo

En un entorno de desarrollo, el backend carga los plugins desde disco leyendo `back/kwirth-dev.json`:

```json
{
  "plugins": {
    "pinocchio": "../plugins/pinocchio/dist"
  },
  "providers": {
    "business": "../providers/business/dist"
  },
  "docs": {
    "pinocchio": "../plugins/pinocchio/docs/pinocchio.tgz"
  }
}
```

La entrada de `docs` es la que hace que **esta guía** quede accesible desde la propia UI de kwirth.

## Construir desde fuente

```bash
cd plugins/pinocchio
npm install
npm run build     # front.js + back.js + docs/pinocchio.tgz + dist/package.json
npm run watch     # reconstruye todo en cada cambio, la guía incluida
npm run docs      # sólo reempaqueta la guía
```

`build` y `watch` cubren **las tres piezas**: el bundle de front, el de back y el tarball de la guía. No hace
falta acordarse de empaquetar la documentación por separado.

Con `watch` en marcha:

- un cambio en `src/front/` lo recoge el navegador solo (el front sondea `front.js` cada 2 s);
- un cambio en `src/back/` **requiere reiniciar el core**, que cachea el módulo de back;
- un cambio en `docs/guide/` reconstruye el tarball al vuelo, pero el core lo instala al arrancar, así que se
  ve tras reiniciarlo.

## Qué hace el canal al arrancar

Cada vez que un usuario abre el canal, la instancia del backend:

1. Se suscribe a los providers `metrics`, `business` (espacios `customers.status`, `branches.status`,
   `launch.immediate`) y `events` (los 11 kinds que vigila).
2. Lee los **providers de IA** del almacén común (`kwirth-ai-providers`) y construye los modelos.
3. Lee su propia configuración (`pinocchio-config`) del almacén del canal.
4. Lee los **LLMs** del almacén común (`kwirth-ai-llms`); si hay alguno, sustituye a los que tuviera guardados.

> ⚠️ **Los puntos 2 y 4 sólo ocurren al arrancar el canal.** Si un administrador crea un provider desde los
> menús *AI Providers* del core con el canal ya abierto, ese canal no lo verá hasta que se cierre y se vuelva
> a abrir. Ver [Límites conocidos](06-limits.md).

## Comportamiento del canal

Lo que el canal declara al core, y lo que significa para el usuario:

| Propiedad | Valor | Efecto |
|-----------|-------|--------|
| `routable` | `false` | No se puede dirigir a un recurso concreto: siempre es de clúster. |
| `pauseable` | `true` | Se puede pausar y continuar. |
| `modifiable` | `false` | No se puede reconfigurar la instancia en caliente. |
| `reconnectable` | `true` | Sobrevive a una reconexión del websocket. |
| `resourced` | `false` | No selecciona namespaces ni pods al arrancar. |
| `cluster` | `true` | Es un canal de ámbito de clúster. |

No tiene diálogo de *Setup*: no hay nada que elegir antes de arrancarlo.
