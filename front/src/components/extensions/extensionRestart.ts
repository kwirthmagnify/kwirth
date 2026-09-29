/*
    The "a restart is needed" notice, in a SINGLE PLACE.

    An extension may declare `requiresRestart` in its package.json, and the typical case is bringing its
    own express router: the core hooks them up ONLY at startup, so until it is restarted, a freshly
    installed extension answers 404 on its routes.

    The same holds the other way round and until now was not said: on UNINSTALLING it, its router stays
    mounted, because it cannot be unhooked hot either. The extension disappears from the list and it
    looks done, when it is still answering. Hence the notice has to tell the two actions apart — the
    install text was flatly false for the other case.

    And updating is a THIRD case, not an installation: it is not that the extension "will not work", it
    is that the PREVIOUS one goes on working. Telling somebody their extension does not work while they
    are watching it work is the surest way to have them ignore the notice.

    When updating, `requiresRestart` is looked at on BOTH, the one going away and the one arriving: if
    the old one brought a router, its router stays mounted even though the new one declares none.
*/

export enum ERestartAction {
    INSTALL = 'install',
    UNINSTALL = 'uninstall',
    UPDATE = 'update'
}

/*
    A DCE that is updated needs the BROWSER reloaded as well, and that is a fourth case rather than a
    variant of the third (plan: plans/dce/PRD.md, RNF4).

    The reason is the type's own: a DCE is an object the core instantiates ONCE, and every consumer holds
    a reference to that very object. Restarting the server rebuilds the back end's, but the front end's
    lives in the page — the plugins, themes and homepages loaded in this tab go on using the instance the
    previous version created until the page is reloaded. Saying only "restart the server" would be half
    the truth, and the half that is missing is the one the user is looking at.
*/
export const dceReloadNotice = (extension: string, action: ERestartAction): string => {
    switch (action) {
        case ERestartAction.INSTALL:
            return `DCE '${extension}' has been installed. Extensions that require it will find it from now on; reload the page to use it in this tab.`
        case ERestartAction.UNINSTALL:
            return `DCE '${extension}' has been uninstalled, but whatever is already running keeps the instance it was given until the Kwirth server is restarted and the page reloaded.`
        case ERestartAction.UPDATE:
            return `DCE '${extension}' has been updated, but the previous instance stays in use until the Kwirth server is restarted and the page reloaded.`
    }
}

// The name goes in the message on purpose: when installing or removing several in a row, a "this
// extension" does not say which of them is the one leaving the server half-done.
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
