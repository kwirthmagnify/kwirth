// common-sql — isomorphic types (back/front) of the shared relational storage service.

// Common storage key where the core keeps the SQL server(s) config
// (like common-ai's STORAGE_KEY_PROVIDERS/STORAGE_KEY_LLMS). It is written as a secret.
export const STORAGE_KEY_SQL_SERVERS = 'kwirth-sql-servers'

// Config of a SQL server. The admin provides it and the core injects it with configure().
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
