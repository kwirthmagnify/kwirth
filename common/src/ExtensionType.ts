// Tipo de extensión de Kwirth. Enum (regla: no string-literals para valores enumerados que cruzan
// back↔front). Nombre y valores en SINGULAR.
//
// OJO: no confundir estos valores con las RUTAS HTTP (plurales: `/plugins`, `/providers`, …) ni con
// las CLAVES del JSON de licencia (`channels`/`providers`/…): esos contratos se mantienen literales.
// El enum ordena el CÓDIGO (tipo); rutas/claves quedan como strings en su frontera.
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
    WEBHOOK = 'webhook'
}
