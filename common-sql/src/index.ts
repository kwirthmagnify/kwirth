// common-sql — tipos isomórficos (back/front) del servicio de almacenamiento relacional compartido.

// Clave común de storage donde el core guarda la config de servidor(es) SQL
// (como STORAGE_KEY_PROVIDERS/STORAGE_KEY_LLMS de common-ai). Se escribe como secret.
export const STORAGE_KEY_SQL_SERVERS = 'kwirth-sql-servers'

// Config de un servidor SQL. La provee el admin y la inyecta el core con configure().
export interface ISqlServer {
    id: string
    name: string
    client: string           // motor (knex). Hoy: 'pg'. Hook para otros motores en el futuro (carga dinámica del driver).
    host: string
    port: number
    user: string
    password: string
    ssl: boolean
    maintenanceDb?: string   // BD de mantenimiento para CREATE/DROP/list DATABASE (default 'postgres')
}
