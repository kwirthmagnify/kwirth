// Configuracion del propio Kwirth (no la del usuario, que vive en Settings.ts).
// Se persiste en el back bajo la clave 'kwirth.settings' y se sirve por /core/settings.
// Todos los campos son opcionales: unos settings guardados antes de que existiera un campo no lo
// tendran, y el back resuelve el valor efectivo con su propia precedencia antes de devolverlos.
//
// NOTA: este tipo esta duplicado en back/src/api/SettingsApi.ts. Deberia vivir en
// @kwirthmagnify/kwirth-common, pero publicar common arrastra la cascada completa de dependientes;
// moverlo alli en el proximo publish de common.
interface IKwirthSettings {
    metricsInterval?: number
}

export type { IKwirthSettings }
