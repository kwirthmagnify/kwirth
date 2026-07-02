/*
    Métodos de autenticación que el back publica (GET /core/auth/method) y el front
    usa para pintar la pantalla de login. 'kwirth' es el login user/password incorporado;
    los IdP (Google, ...) son métodos REDIRECT que navegan a su startUrl.
*/
enum EAuthMethodKind {
    PASSWORD = 'password',   // método kwirth → formulario usuario/contraseña
    REDIRECT = 'redirect'    // IdP (OIDC/OAuth2) → botón que navega a startUrl
}

interface IAuthMethod {
    id: string               // instanceId del IdP, o 'kwirth'
    label: string
    kind: EAuthMethodKind
    startUrl?: string         // solo REDIRECT: ruta a la que navega el botón de login
}

export { EAuthMethodKind, IAuthMethod }
