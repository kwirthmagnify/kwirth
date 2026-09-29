// Kwirth's extension type. An enum (the rule: no string literals for enumerated values that cross
// back↔front). Name and values in the SINGULAR.
//
// CAREFUL: do not confuse these values with the HTTP ROUTES (plural: `/plugins`, `/providers`, …) or
// with the KEYS of the licence JSON (`channels`/`providers`/…): those contracts stay literal.
// The enum orders the CODE (the type); routes and keys remain strings at their boundary.
export enum EExtensionType {
    PLUGIN = 'plugin',
    PROVIDER = 'provider',
    SENDER = 'sender',
    THEME = 'theme',
    HOMEPAGE = 'homepage',
    IDP = 'idp',
    DOCS = 'docs',
    LOGIN = 'login',
    PACK = 'pack',
    WEBHOOK = 'webhook',
    // A themed set of tools for the AI models. Back-end only: its front end — the selector and the
    // configuration dialog — is provided by the core and shared by every plugin that uses AI.
    AITOOLSET = 'aitoolset',
    // A dynamic core extension: objects the core instantiates ONCE and hangs off a global, for other
    // extensions to consume by id. Code shared by several extensions that does not belong in the core
    // (plan: plans/completed/dce/PRD.md). It produces no data and draws nothing of its own.
    DCE = 'dce'
}
