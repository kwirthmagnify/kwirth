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
