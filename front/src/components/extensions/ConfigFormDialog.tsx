import React, { useContext, useEffect, useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    UNA configuracion, en formulario, montado a partir del `configSchema` de la extension.

    Es una de las cuatro formas que tiene una extension de configurarse, y los ficheros se llaman por esa
    forma: ConfigFormDialog (esta), ConfigListDialog (varias con nombre), ConfigJsonDialog (JSON libre) y
    ConfigFrontDialog (la pinta la propia extension).

    Estaba copiado en CINCO diálogos de gestión (logins, senders, providers, webhooks e IdP) con las mismas
    tres ramas —texto, secreto con ojo, desplegable— y la misma carga y guardado contra
    `<endpoint>` (GET y PUT). Se saca aqui al migrar logins al gestor generico, para que los que quedan lo
    hereden en vez de traerse su copia.

    Los secretos siguen la regla del proyecto: el back devuelve el valor REAL, el campo llega relleno y lo
    unico que cambia es que se enseña con `type='password'` y un ojo para verlo.

    ⚠️ Se envian TODOS los campos, tambien los que se dejan vacios. La copia anterior omitia los vacios, y
    eso hacia imposible BORRAR un valor ya guardado: se quitaba del formulario, se guardaba, y el back
    seguia con el de antes. Un numero vacio si se omite, porque no hay numero que mandar.
*/

interface IConfigFormDialogProps {
    /** Titulo completo, p.ej. 'Configure — Corporate login'. */
    title: string
    /** Seccion de la guia para el boton de ayuda. */
    helpSection?: string
    /*
        El formulario, de una de las dos formas en que los tipos lo tienen:
          · `schema`, cuando la metadata de la extension ya lo trae (logins)
          · `schemaEndpoint`, cuando hay que pedirlo (providers, en <id>/schema)
    */
    schema?: IConfigFieldDef[]
    schemaEndpoint?: string
    /** Ruta del back, relativa al backendUrl: GET para leer y PUT para guardar. */
    endpoint: string
    /** Que decir cuando la extension no tiene nada configurable. */
    emptyText?: string
    onClose: () => void
}

const ConfigFormDialog: React.FC<IConfigFormDialogProps> = (props: IConfigFormDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [schema, setSchema] = useState<IConfigFieldDef[]>(props.schema ?? [])
    const [values, setValues] = useState<Record<string, string>>({})
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const cargar = async () => {
            const [cfgRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}${props.endpoint}`, addGetAuthorization(accessString)).catch(() => undefined),
                props.schemaEndpoint
                    ? fetch(`${backendUrl}${props.schemaEndpoint}`, addGetAuthorization(accessString)).catch(() => undefined)
                    : Promise.resolve(undefined)
            ])
            // Sin configuracion guardada todavia el formulario sale con los defaults del schema.
            const cfg: Record<string, unknown> = cfgRes?.ok ? await cfgRes.json() : {}
            const campos = schemaRes?.ok ? await schemaRes.json() as IConfigFieldDef[] : (props.schema ?? [])
            setSchema(campos)

            const vals: Record<string, string> = {}
            for (const field of campos) {
                const guardado = cfg[field.name]
                vals[field.name] = guardado !== undefined ? String(guardado) : (field.default !== undefined ? String(field.default) : '')
            }
            setValues(vals)
        }
        cargar()
    }, [backendUrl, accessString, props.endpoint, props.schemaEndpoint, props.schema])

    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const body: Record<string, unknown> = {}
            for (const field of schema) {
                const val = values[field.name] ?? ''
                if (field.type === 'number') {
                    if (val !== '') body[field.name] = Number(val)
                }
                else if (field.type === 'boolean') body[field.name] = val === 'true'
                else body[field.name] = val
            }
            const res = await fetch(`${backendUrl}${props.endpoint}`, addPutAuthorization(accessString, JSON.stringify(body)))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            props.onClose()
        }
        catch (err) { setError(`Failed to save config: ${err}`) }
        finally { setSaving(false) }
    }

    const field = (f: IConfigFieldDef) => {
        // Un booleano es un interruptor, no un campo de texto con 'true' dentro.
        if (f.type === 'boolean') {
            return (
                <FormControlLabel key={f.name} label={f.label}
                    control={<Switch size='small' checked={values[f.name] === 'true'}
                        onChange={e => setValues(v => ({ ...v, [f.name]: String(e.target.checked) }))} />} />
            )
        }

        const esSecreto = f.type === 'password'
        const comun = {
            key: f.name,
            label: f.label,
            value: values[f.name] ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues(v => ({ ...v, [f.name]: e.target.value })),
            size: 'small' as const,
            fullWidth: true,
            required: f.required,
            sx: { '& .MuiOutlinedInput-root': { backgroundColor: 'transparent' } }
        }

        if (f.type === 'select') {
            return <TextField {...comun} select>
                {(f.options ?? []).map((opt, i) => <MenuItem key={opt} value={opt}>{f.labels?.[i] ?? opt}</MenuItem>)}
            </TextField>
        }

        return <TextField {...comun}
            type={esSecreto && !showSecrets[f.name] ? 'password' : 'text'}
            slotProps={{
                htmlInput: { autoComplete: 'off' },
                ...(esSecreto ? {
                    input: {
                        endAdornment: (
                            <IconButton size='small' edge='end' onClick={() => setShowSecrets(s => ({ ...s, [f.name]: !s[f.name] }))} title={showSecrets[f.name] ? 'Hide' : 'Show'}>
                                {showSecrets[f.name] ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        )
                    }
                } : {})
            }}
        />
    }

    return (
        <Dialog open={true} maxWidth='xs' fullWidth>
            {props.helpSection
                ? <DialogTitleHelp section={props.helpSection} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
                : <DialogTitleHelp section='guide/extensions/index' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
            }
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {schema.length === 0
                        ? <Typography variant='body2' color='text.secondary'>{props.emptyText ?? 'Nothing to configure.'}</Typography>
                        : schema.map(f => field(f))}
                    {error && <Typography variant='caption' color='error'>{error}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={save} disabled={saving || schema.length === 0}>{saving ? <CircularProgress size={16} /> : 'SAVE'}</Button>
                <Button onClick={props.onClose}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ConfigFormDialog }
