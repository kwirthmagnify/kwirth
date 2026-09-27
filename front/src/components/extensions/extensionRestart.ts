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
