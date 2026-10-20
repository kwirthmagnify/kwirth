/*
    🔴 THIS MOVED TO `common` (A13 of plans/auth-hardening).

    `scopeAllows` and `keyAllows` were written here, and that was half the answer: the back can import
    common-back, the FRONT cannot —it is resolved from the core's server-side global, which does not
    exist in a browser— so every extension whose UI had to decide whether to offer something wrote the
    walk again. Magnify did, then trivy did, and that second copy is what turned the finding from a
    hypothesis into a fact.

    They now live in `common/src/ExtensionScope.ts`, next to the scope catalogue and the thin-scope
    format, which is where anything that reasons about scopes belongs. This file keeps serving them
    unchanged so that what already imports them from common-back —fileman, trivy, excubitor, and any
    third-party extension built against 0.6.x— does not have to be touched to keep working.

    Nothing new should be added here: the home is `common`.
*/
export { scopeAllows, keyAllows, scopeLevelOf } from '@kwirthmagnify/kwirth-common'
