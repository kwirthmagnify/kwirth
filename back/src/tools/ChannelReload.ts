/*
    Qué sockets hay que cerrar cuando el canal de un plugin se REEMPLAZA en caliente.

    🔴 El porqué, que es lo que no se ve desde fuera. Al recargar un plugin, el core tira el canal viejo y
    crea uno nuevo: rehace sus pluviders y su `startChannel()`, pero la instancia nueva nace **sin
    conexiones** — `addObject()` solo se llama en un START, y ningún navegador va a mandar otro porque su
    socket no se ha caído. A partir de ahí el front habla con alguien que no le conoce: sus comandos llegan
    a un canal que no reconoce la instancia, y los datos no vuelven porque todo lo que el canal difunde
    recorre unas conexiones vacías. Desde la pantalla parece que el back no responde; en el log no aparece
    nada. Diagnosticado el 2026-10-20 con Excubitor, que es el que más lo sufre por desarrollarse con el
    watch puesto, pero le ocurre a CUALQUIER plugin recargado en caliente.

    Cerrar el socket enciende la maquinaria que YA existe: el navegador recibe su `onclose`, avisa, y
    rehace el RECONNECT —que el canal nuevo atiende con `updateConnection`— o un START limpio. No hace
    falta un camino nuevo ni que el front aprenda nada.

    ⚠️ Y de ahí la segunda condición, que es la que esta función existe para no olvidar: un socket que
    ADEMÁS sirve a otro canal **no se toca**. Cerrarlo se llevaría por delante una pestaña que no tiene
    nada que ver con el plugin recargado, y eso sería un efecto colateral invisible.

    Pura a propósito: recibe los sockets y quién los sirve, y devuelve los que hay que cerrar.
*/
export const socketsToCloseOnReload = <T>(ofReloadedChannel: T[], servedByAnotherChannel: (socket: T) => boolean): T[] =>
    ofReloadedChannel.filter(socket => !servedByAnotherChannel(socket))
