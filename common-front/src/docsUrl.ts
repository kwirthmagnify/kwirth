// La guía de una extensión la sirve el propio core, en /core/docs/<tipo>/<id>, desde que 'docs' es un tipo
// de extensión instalable. Así que la URL es DERIVABLE del cluster y no hay nada que configurar.
//
// Existe aquí, y no copiada en cada plugin, por un fallo real: agora la pedía en un campo de su pantalla de
// settings, alguien la tecleó sin el `/core`, y su botón de ayuda estuvo dando 404 durante meses sin que
// nadie lo notara — porque HelpButton, si no le pasabas base, se iba a un `http://localhost:4000` que no
// existe en ningún cluster. Ese default ya no está: sin base, el botón no se pinta.
//
// Excubitor repetía la misma cadena a mano en 20 ficheros e iter en 9. Repetirla no es solo feo: es que
// cuando la ruta cambie habrá que acordarse de treinta sitios.

export const docsUrl = (clusterUrl: string | undefined, targetType: string, id: string): string =>
    `${(clusterUrl ?? '').replace(/\/+$/, '')}/core/docs/${targetType}/${id}`

/** Atajo para el caso corriente: la guía de un plugin. */
export const pluginDocsUrl = (clusterUrl: string | undefined, pluginId: string): string =>
    docsUrl(clusterUrl, 'plugin', pluginId)
