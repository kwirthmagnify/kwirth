/*
    ¿Acepta Kwirth un upgrade a WebSocket en esta ruta?

    🔴 El servidor WS se monta sobre el HTTP sin declarar `path`, así que la librería acepta el upgrade en
    CUALQUIER ruta y la única criba era la del ingress del cliente. Eso no es una defensa: el ingress no lo
    controlamos y además puede incumplir su propia declaración. Visto en un despliegue real el 2026-10-09:

        ingress:  path: /kwirth   ·   pathType: Prefix     ← dice "por segmentos"
        realidad: /kwirth2, /kwirthXYZ y /kwirth<loquesea> llegaban al canal y se aceptaban

    nginx había traducido ese `Prefix` a un prefijo de CADENA. Con eso, cualquier regla de WAF, de auditoría
    o de autorización escrita contra la ruta exacta se esquiva pidiendo otra. Y el canal se abría igual: el
    `GET /kwirth2` daba 404, pero el upgrade a WebSocket se aceptaba sin mirar el path.

    La comprobación es por SEGMENTOS, que es lo que `Prefix` significa de verdad: la ruta raíz, o la ruta
    raíz seguida de `/`. `/kwirth2` no es una subruta de `/kwirth`: es otra ruta que empieza igual.

    Sin `rootPath` configurado NO se filtra nada, y es deliberado: ese es el caso de un ingress que
    reescribe (`rewrite-target`), donde al servidor le llega la ruta ya recortada y no hay nada contra lo
    que comparar. Las dos cosas son excluyentes —con reescritura las rutas HTTP tampoco casarían—, así que
    el filtro cubre el caso real sin romper esos despliegues.
*/
export const wsUpgradeAllowed = (requestUrl: string | undefined, rootPath: string): boolean => {
    if (!rootPath || rootPath === '/') return true        // sin prefijo propio no hay nada que validar
    const path = (requestUrl || '/').split('?')[0].split('#')[0]
    const root = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath
    return path === root || path === root + '/' || path.startsWith(root + '/')
}
