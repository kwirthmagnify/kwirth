// Catalogue of RBAC scopes an extension (a channel) declares. It is used to populate the security
// editor (User/API Security) in the front end and to validate and manage permissions in the back end.
// Every scope follows the naming `<plugin>$<scope>` (e.g. `defender$poladmin`), so scopes from
// different plugins never collide.
//
// It is exposed at runtime through `IChannel.getScopes()` (optional), in common-front as well as in
// common-back; it is NOT static metadata from the package.json or the manifest.
export interface IExtensionScope {
    scope: string          // "<plugin>$<scope>", p.ej. "defender$poladmin"
    label: string          // etiqueta legible para el admin, p.ej. "Defender · Admin"
    description: string    // qué permite el scope (se muestra al conceder permisos)
}
