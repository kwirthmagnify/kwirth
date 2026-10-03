#&nbsp;Pac-Man — plugin de canal para Kwirth

El clásico Pac-Man arcade jugable dentro de una pestaña de Kwirth.

No consume datos del cluster. En términos de Kwirth es un **canal autónomo**:
su `getChannelData()` declara `cluster: false` y `resourced: false`. No pide
ámbito de cluster ni selecciona pods.

El juego corre entero en el navegador dentro de un iframe. El back solo
persiste el marcador en un ConfigMap del cluster.

## Lo que tiene de interesante

La partida sobrevive a los cambios de pestaña. Cuando el usuario se va a otra
pestaña de Kwirth y vuelve, el juego sigue donde estaba.

- La instancia del juego vive en `channelObject.data`, que Kwirth guarda en el
  `ITabObject`. Ese objeto está fuera del árbol de render de React y no se
  destruye al cambiar de pestaña.
- El iframe se reposiciona sobre el área del tab al montar y se oculta al
  desmontar. Solo `stopChannel` lo destruye de verdad.

## Controles

| Tecla       | Acción                  |
|-------------|-------------------------|
| Flechas     | mover Pac-Man           |
| Espacio     | insertar moneda         |
| 1           | empezar 1 jugador       |
| 2           | empezar 2 jugadores     |

## Configuración

Por instancia: pausa automática al perder el foco, y sender opcional para
notificar cuando se bate el récord.

## Sonido

El juego referencia archivos de sonido (`sounds/*.mp3`) que **no se incluyen** en
el plugin (son ~1.8 MB de MP3s). El juego funciona sin ellos — los sonidos fallan
silenciosamente y el resto del juego no se ve afectado.

Los audios originales están en el repo upstream:
https://github.com/Alex313031/web-pacman/tree/master/sounds

## Marcador

Vive en el cluster, no en el navegador: el back lo guarda con `writeStorage`,
que acaba en un ConfigMap `kwirth-store-channel-pacman-scores`. La tabla la ven
todos los usuarios de ese Kwirth y sobrevive a cambiar de máquina.

Si no hay socket, cae a `localStorage`.

## Compilar

```
npm install
npm run build     # typecheck + dist/front.js + dist/back.js + dist/package.json
npm run watch     # rebuild rápido sin typecheck
```

Para publicar, `npm publish --access=public` sobre la carpeta `dist`. El
paquete sale como `@kwirthmagnify/kwirth-plugin-pacman`.

## Registro en Kwirth

Añadir a `plugins/manifest.json`:

```json
{
  "extensionType": "plugin",
  "id": "pacman",
  "version": "0.1.0",
  "name": "Pac-Man",
  "url": "https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-pacman/-/kwirth-plugin-pacman-0.1.0.tgz",
  "description": "Pac-Man channel plugin for Kwirth - the classic arcade game playable in a Kwirth tab",
  "icon": "SportsEsports"
}
```

## Licencia

El juego es una reimplementación de Shaun Williams (GPL v3). Ver `NOTICE.md` y
`LICENSE.upstream`.

Más información sobre Kwirth: https://kwirthmagnify.dev
