import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'

/*
    Which fields of an extension's configuration schema hold a SECRET: every 'password', and any field
    marked 'secret' (a multi-line secret such as an SSH private key, IConfigFieldDef.secret).

    ONE predicate for every place that treats secrets differently — the Kwirth export without credentials,
    the IdP masking, the AI assistant's prompt. Each of them used to ask `type === 'password'` on its own,
    and a 'textarea' marked secret would have gone out in clear through whichever one was not updated.
*/
export const isSecretFieldDef = (field: Pick<IConfigFieldDef, 'type' | 'secret'>): boolean =>
    field.type === 'password' || field.secret === true

/** The names of a schema's secret fields. */
export const secretFieldNames = (schema: IConfigFieldDef[]): string[] => schema.filter(isSecretFieldDef).map(f => f.name)

/*
    A copy of `values` with every secret field the schema declares EMPTIED (not removed: whoever imports
    the file sees the field is there and has to be filled in). The Kwirth export without credentials, for
    every family, goes through here.
*/
export const redactSecretFields = <T extends object>(schema: IConfigFieldDef[], values: T): T => {
    const secretos = secretFieldNames(schema)
    const copia = { ...values } as Record<string, unknown>
    for (const campo of secretos) if (campo in copia) copia[campo] = ''
    return copia as T
}
