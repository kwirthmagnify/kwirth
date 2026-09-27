import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'

/*
    Whether an extension can be installed on top of another one, in ONE SINGLE PLACE.

    Installing and updating are the SAME operation: the body of install() in every manager already
    replaced —index, cached code, reloaded back module— and the only thing preventing it was a guard
    copied nine times that rejected any id already installed. Updating therefore forced an uninstall
    first, which is exactly what takes the configuration away with it.

    Hence the permission is EXPLICIT and comes from outside: without `upgrade` the behaviour is the one
    of always, and whoever wants to overwrite an installation has to ask for it. An accidental install
    must not replace anything on its own account.

    And only forwards. Going back to an earlier version is not updating: it leaves the index saying one
    thing and the configuration —which is not touched— meant for another. Reinstalling the SAME version
    is not allowed either, because it fixes nothing that uninstalling and installing would not fix, and
    it disguises the real case of having clicked twice.
*/
export const assertInstallable = (kind: string, id: string, installed: { version?: string } | undefined, newVersion: string | undefined, upgrade?: boolean): void => {
    if (!installed) return
    if (!upgrade) throw new Error(`${kind} '${id}' is already installed`)
    /*
        With no version on either side there is no way of knowing whether this moves forward. It really
        happens: what is bundled does not always carry one. It is rejected rather than stepping blind.
    */
    if (!newVersion || !installed.version)
        throw new Error(`${kind} '${id}' cannot be updated: the installed or the new version is unknown`)
    if (!versionGreaterThan(newVersion, installed.version))
        throw new Error(`${kind} '${id}' v${installed.version} is already installed, and v${newVersion} is not newer`)
}
