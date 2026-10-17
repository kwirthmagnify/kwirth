import { parseResources } from '@kwirthmagnify/kwirth-common'

/*
    Whether a key's GRANTED resources reach the level an operation needs.

    🔴 It reads what the key carries (`accessKey.resources`), never anything the caller writes in the
    request: the accessKey cannot be tampered with —a bearer key is an HMAC over its own resources, a
    registered one is compared whole against the server's list— and that is what makes it the only
    trustworthy input here.

    Same semantics as the core's `getScopeLevel`: the HIGHEST of the granted scopes wins, and a scope
    the ladder does not know is -1 (indexOf), so it grants nothing.

    ⚠️ THIRD copy of this function (excubitor has `hasScopeKey`, fileman has `scopeAllows`). It belongs
    in common-back and moving it there is written down in plans/trivy-endpoint-auth/PLAN.md; it is kept
    local so the fix does not depend on the core shipping a new common-back first — the plugins resolve
    it from the core's global at runtime, which is exactly the trap that took the core down with the IdP
    connectors.
*/
export const scopeAllows = (resources: string, required: string, levelOf: (scope: string) => number): boolean => {
    const requiredLevel = levelOf(required)
    try {
        return parseResources(resources).some(r => r.scopes.split(',').some(sc => levelOf(sc) >= requiredLevel))
    }
    catch (err) {
        return false
    }
}
