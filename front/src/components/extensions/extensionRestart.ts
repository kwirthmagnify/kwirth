/*
    El aviso de "hace falta reiniciar", en UN SOLO SITIO.

    Una extensión puede declarar `requiresRestart` en su package.json, y el caso típico es traer su
    propio router de express: el core los engancha SOLO al arrancar, así que hasta que no se reinicie,
    una extensión recién instalada responde 404 en sus rutas.

    Lo mismo vale al revés y hasta ahora no se decía: al DESINSTALARLA su router sigue montado, porque
    tampoco se puede desenganchar en caliente. La extensión desaparece de la lista y parece que ya
    está, cuando sigue respondiendo. De ahí que el aviso tenga que distinguir las dos acciones — el
    texto de instalar era directamente falso para el otro caso.

    Y actualizar es un TERCER caso, no una instalación: la extensión no es que "no vaya a funcionar", es
    que sigue funcionando la de ANTES. Decirle a alguien que su extensión no funciona cuando la ve
    funcionando es la mejor forma de que ignore el aviso.

    Al actualizar se mira `requiresRestart` en las DOS, la que se va y la que llega: si la vieja traía
    router, el suyo sigue montado aunque la nueva ya no declare ninguno.
*/

export enum ERestartAction {
    INSTALL = 'install',
    UNINSTALL = 'uninstall',
    UPDATE = 'update'
}

// El nombre va en el mensaje a propósito: instalando o quitando varias seguidas, un "this extension"
// no dice cuál de ellas es la que deja el servidor a medias.
export const restartNotice = (extension: string, action: ERestartAction): string => {
    switch (action) {
        case ERestartAction.INSTALL:
            return `'${extension}' has been installed, but it will not work until the Kwirth server is restarted.`
        case ERestartAction.UNINSTALL:
            return `'${extension}' has been uninstalled, but it stays active until the Kwirth server is restarted.`
        case ERestartAction.UPDATE:
            return `'${extension}' has been updated, but the previous version stays active until the Kwirth server is restarted.`
    }
}
