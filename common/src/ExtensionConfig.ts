/*
    The COMMON extension configuration contract.

    Every extension publishing a configuration form (senders, webhooks, IdP connectors, logins and
    providers) describes its fields with THIS type. Each family used to have its own, nearly identical
    but divergent: provider said 'string' where the rest said 'text', only it had 'default', only sender
    and webhook had 'common', and its definition did not even live here (it was inside the core, in
    back/src/tools/ProviderManager.ts).

    MIND: do not confuse TConfigFieldType (the type of ONE FIELD of the form) with EExtensionType (the
    extension's type: provider, sender, plugin...), which lives in kwirth-common and is what the
    artefact's package.json declares.
*/

/*
    The type of a field of the configuration form.

    IT IS A UNION OF STRINGS AND NOT AN ENUM, ON PURPOSE. Do not turn it into an enum: it was tried and
    reverted, with these measurements over the senders/console bundle:

        union of strings ..............      3,509 bytes
        enum imported from the root ...  15,849,494 bytes   (x4,500)
        enum from its own module ......      4,790 bytes

    The reason is that an artefact only imports TYPES from this package, and TypeScript erases them when
    compiling, so today it drags in not one byte of kwirth-common-back. An enum is a VALUE at runtime: as
    soon as it is used, esbuild has to bundle the whole of dist/index.js, which re-exports KubernetesTools
    (-> @kubernetes/client-node) and oidc/oauth2 (-> openid-client). Publishing ESM with
    sideEffects:false does not save it either, that was tried. As long as this package's root stays heavy,
    any VALUE exported here and used by the artefacts carries that cost.

    What the front end draws today for each value:
      'text'      a text field. It is the default behaviour when 'type' is omitted.
      'number'    a numeric field.
      'boolean'   a switch. The sender, webhook, idp and provider managers draw it; the login one does not.
      'password'  a masked field with a visibility eye.
      'select'    a dropdown fed by 'options'. The sender, webhook and login managers draw it; the idp and
                  provider ones do not.
      'json'      a free text area for JSON. NO manager draws it yet: today it falls back to a text field.
                  Declaring it is valid, but do not expect a structured editor.
      'multiselect' a dropdown of SEVERAL values, fed by 'options'. The value is stored as a single
                  comma-separated string, not as an array: the configuration contract has no list type,
                  and changing it would force migrating what is already stored for 25 fields. The core's
                  generic form draws it (ConfigFormDialog); where it is not supported it falls back to a
                  text field, and whatever the user types by hand still works.
*/
export type TConfigFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select' | 'json' | 'multiselect'

/*
    A field of an extension's configuration form.

    'type' is OPTIONAL on purpose: omitting it is equivalent to 'text', which is how 25 of the 64 fields
    of the published artefacts are written today.
*/
export interface IConfigFieldDef {
    /** The key the value is stored under in the configuration. */
    name: string
    /** The label the user sees on the form. */
    label: string
    /** Absent = 'text'. */
    type?: TConfigFieldType
    required?: boolean
    /** Accepted values when 'type' is 'select'. Ignored otherwise. */
    options?: string[]
    /*
        Labels to show for each of 'options', position by position; when one is missing, the raw value is
        drawn. It serves dropdowns whose value is not presentable as it is (the 'timed' sender, for
        instance, stores 'Europe/Madrid' but shows 'Europe/Madrid (UTC+2)').
    */
    labels?: string[]
    /** The value the field is pre-filled with while nothing has been saved. */
    default?: string | number | boolean
    /** The field is common to ALL of the extension's configurations, not specific to each one. */
    common?: boolean
}

/*
    The extension's description as a node of a graph (the flow editor for senders and webhooks).
    'icon' is the name of a kwirthicons icon, not an @mui/icons import.
*/
export interface IExtensionNodeMeta {
    label: string
    icon?: string
    description?: string
}
