// Catálogo de scopes RBAC que declara una extensión (canal). Sirve para poblar el editor de seguridad
// (User/API Security) en el front y para validar/gestionar permisos en el back. Cada scope sigue la
// nomenclatura `<plugin>$<scope>` (p.ej. `defender$poladmin`), de modo que no colisiona entre plugins.
//
// Se expone en runtime vía `IChannel.getScopes()` (opcional) tanto en common-front como en common-back;
// NO es metadata estática del package.json/manifest.
export interface IExtensionScope {
    scope: string          // "<plugin>$<scope>", p.ej. "defender$poladmin"
    label: string          // etiqueta legible para el admin, p.ej. "Defender · Admin"
    description: string    // qué permite el scope (se muestra al conceder permisos)
}
