import { AccessKey, parseResources } from '@kwirthmagnify/kwirth-common'

/*
    Deciding whether a key was granted enough for an operation.

    It lives here because the same function had been written THREE times —`hasScopeKey` in excubitor,
    `scopeAllows` in fileman (0.2.27) and in trivy (0.2.30)— each time a channel needed to authorise
    something the core does not authorise for it. A security check copied into every plugin is a
    security check that diverges: the day one of them gets the comparison wrong, nothing says so.

    🔴 What is read is what the KEY CARRIES, never what the client asked for. An accessKey cannot be
    tampered with —a bearer key is an HMAC over its own resources, a registered one is compared whole
    against the server's list— while `instanceConfig.scope` is a field of an unsigned JSON the browser
    composes. Reading the latter would let anybody grant themselves a scope by typing it.

    The ladder stays the channel's: it is passed in as `levelOf`, which is each channel's own
    `getChannelScopeLevel`. This module does not know what 'fileman$write' means, and should not.
*/

/*
    Whether any granted scope reaches the level `required` needs.

    Same semantics as the core's `getScopeLevel`: resources are OR'd, the HIGHEST scope wins, and a
    scope the ladder does not know is -1 (indexOf), so it grants nothing. That last part is what makes
    an unknown token —a thin scope on a channel that does not understand it, a scope that was renamed—
    fail CLOSED without anybody writing code for it.
*/
export const scopeAllows = (resources: string, required: string, levelOf: (scope: string) => number): boolean => {
    const requiredLevel = levelOf(required)
    try {
        return parseResources(resources).some(r => r.scopes.split(',').some(sc => levelOf(sc) >= requiredLevel))
    }
    catch (err) {
        // Malformed resources authorise nothing. They cannot be trusted, and an exception here would
        // escape into whatever route is asking — which, from an async handler, kills the process.
        return false
    }
}

/** The same question when what is at hand is the key the core handed over. No key, no permission. */
export const keyAllows = (accessKey: AccessKey | undefined, required: string, levelOf: (scope: string) => number): boolean =>
    !!accessKey && scopeAllows(accessKey.resources, required, levelOf)
