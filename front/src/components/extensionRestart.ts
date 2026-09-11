/*
    El aviso de "hace falta reiniciar", en UN SOLO SITIO.

    Una extensión puede declarar `requiresRestart` en su package.json, y el caso típico es traer su
    propio router de express: el core los engancha SOLO al arrancar, así que hasta que no se reinicie,
    una extensión recién instalada responde 404 en sus rutas.

    Lo mismo vale al revés y hasta ahora no se decía: al DESINSTALARLA su router sigue montado, porque
    tampoco se puede desenganchar en caliente. La extensión desaparece de la lista y parece que ya
    está, cuando sigue respondiendo. De ahí que el aviso tenga que distinguir las dos acciones — el
    texto de instalar era directamente falso para el otro caso.
*/

export enum ERestartAction {
    INSTALL = 'install',
    UNINSTALL = 'uninstall'
}

// El nombre va en el mensaje a propósito: instalando o quitando varias seguidas, un "this extension"
// no dice cuál de ellas es la que deja el servidor a medias.
export const restartNotice = (extension: string, action: ERestartAction): string =>
    action === ERestartAction.INSTALL
        ? `'${extension}' has been installed, but it will not work until the Kwirth server is restarted.`
        : `'${extension}' has been uninstalled, but it stays active until the Kwirth server is restarted.`
