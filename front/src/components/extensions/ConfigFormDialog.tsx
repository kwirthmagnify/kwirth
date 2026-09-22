import React, { useContext, useEffect, useState } from 'react'
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, ListItemText, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

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
    /*
        Ruta de comprobacion, si la extension sabe probar su configuracion (GET, responde {ok, message}).
        Presente = sale el boton TEST. Es lo que permite saber si unas credenciales valen sin tener que
        esperar a que el provider falle en silencio media hora despues.
    */
    testEndpoint?: string
    /** Que decir cuando la extension no tiene nada configurable. */
    emptyText?: string
    onClose: () => void
}

interface ITestOutcome {
    ok: boolean
    message: string
}

const ConfigFormDialog: React.FC<IConfigFormDialogProps> = (props: IConfigFormDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [schema, setSchema] = useState<IConfigFieldDef[]>(props.schema ?? [])
    const [values, setValues] = useState<Record<string, string>>({})
    // Lo que se cargo del back, para saber si el formulario esta tocado (y no probar lo que no esta guardado)
    const [loaded, setLoaded] = useState<Record<string, string>>({})
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [testing, setTesting] = useState(false)
    const [testOutcome, setTestOutcome] = useState<ITestOutcome | undefined>()

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
            setLoaded(vals)
        }
        cargar()
    }, [backendUrl, accessString, props.endpoint, props.schemaEndpoint, props.schema])

    // Lo que el formulario tiene AHORA, en el formato que espera la extension. Lo usan guardar y probar.
    const buildBody = (): Record<string, unknown> => {
        const body: Record<string, unknown> = {}
        for (const field of schema) {
            const val = values[field.name] ?? ''
            if (field.type === 'number') {
                if (val !== '') body[field.name] = Number(val)
            }
            else if (field.type === 'boolean') body[field.name] = val === 'true'
            else body[field.name] = val
        }
        return body
    }

    const persist = async (): Promise<void> => {
        const res = await fetch(`${backendUrl}${props.endpoint}`, addPutAuthorization(accessString, JSON.stringify(buildBody())))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }

    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            await persist()
            props.onClose()
        }
        catch (err) { setError(`Failed to save config: ${err}`) }
        finally { setSaving(false) }
    }

    // ¿Hay algo escrito que no este guardado? Entonces la prueba no corresponde a lo que se ve.
    const dirty = (): boolean => Object.keys({ ...loaded, ...values }).some(k => (values[k] ?? '') !== (loaded[k] ?? ''))

    /*
        Probar la configuracion. La prueba la hace el BACK, que es quien tiene las credenciales y la red.

        Se manda el BORRADOR por POST: se prueba lo que el usuario tiene delante SIN guardarlo, que es lo
        que hace Excubitor con sus conectores cloud. Obligar a guardar para poder probar es pedirle que
        escriba unas credenciales que a lo mejor estan mal para averiguar si estan mal.

        ⛔ Y este boton NO guarda por su cuenta: si el formulario se hubiera cargado a medias —un campo que
        el back no devuelve, un GET que falla— guardar dejaria la configuracion peor de como estaba.

        Una extension que solo acepte GET prueba lo GUARDADO; entonces, y solo entonces, se avisa de que
        hay cambios pendientes. El dialogo no se cierra: el sentido del boton es corregir y reprobar.
    */
    const test = async () => {
        setTesting(true)
        setError(undefined)
        setTestOutcome(undefined)
        try {
            let res = await fetch(`${backendUrl}${props.testEndpoint}`, addPostAuthorization(accessString, JSON.stringify(buildBody())))
            if (res.status === 404 || res.status === 405) {
                if (dirty()) {
                    setTestOutcome({ ok: false, message: 'This extension can only test the SAVED configuration — save first, then test.' })
                    return
                }
                res = await fetch(`${backendUrl}${props.testEndpoint}`, addGetAuthorization(accessString))
            }
            // La extension responde 200 con {ok, message} incluso al fallar, para que su mensaje llegue
            // entero en vez de convertirse en un error HTTP sin detalle.
            const body = await res.json().catch(() => undefined) as ITestOutcome | undefined
            if (body && typeof body.ok === 'boolean') setTestOutcome({ ok: body.ok, message: body.message || (body.ok ? 'Connection OK' : 'Test failed') })
            else setTestOutcome({ ok: false, message: `The extension did not answer the test (HTTP ${res.status})` })
        }
        catch (err) { setTestOutcome({ ok: false, message: `Could not run the test: ${err}` }) }
        finally { setTesting(false) }
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

        /*
            Varios valores, guardados como UNA cadena separada por comas: el contrato de configuracion no
            tiene tipo lista, y darselo obligaria a migrar lo ya guardado de todos los artefactos.

            Las opciones las trae el schema, que las extensiones pueden generar EN CALIENTE —azure descubre
            las regiones de Azure con las credenciales guardadas—. Si el descubrimiento no da fruto, la
            lista llega vacia; entonces esto cae a campo de texto y lo escrito a mano sigue valiendo, que
            es justo lo que hace falta la primera vez, cuando todavia no hay credenciales que preguntar.
        */
        if (f.type === 'multiselect' && (f.options ?? []).length > 0) {
            const seleccion = (values[f.name] ?? '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean)
            return <TextField {...comun} select
                slotProps={{ select: { multiple: true, renderValue: (v: unknown) => (v as string[]).join(', ') } }}
                value={seleccion}
                onChange={e => {
                    const elegidos = e.target.value as unknown as string[]
                    setValues(v => ({ ...v, [f.name]: elegidos.join(',') }))
                }}>
                {/* Con CHECKBOX: es lo que le dice al usuario que puede marcar VARIOS. Un desplegable que
                    solo cambia el fondo del item elegido parece de seleccion unica. */}
                {(f.options ?? []).map((opt, i) => (
                    <MenuItem key={opt} value={opt} dense>
                        <Checkbox size='small' checked={seleccion.includes(opt)} sx={{ p: 0, mr: 1 }} />
                        <ListItemText primary={f.labels?.[i] ?? opt} slotProps={{ primary: { variant: 'body2' } }} />
                    </MenuItem>
                ))}
            </TextField>
        }

        return <TextField {...comun}
            type={esSecreto && !showSecrets[f.name] ? 'password' : 'text'}
            slotProps={{
                /*
                    Chrome IGNORA autocomplete='off' en lo que cree un formulario de credenciales: al ver un
                    type='password' rellena el campo de texto ANTERIOR como si fuera el usuario (salia 'admin'
                    en 'Client ID'). Con 'new-password' lo clasifica como alta/cambio de credencial y deja de
                    autorrellenar tanto el secreto como el campo de antes. Es lo que ya hacen ConfigListDialog
                    e IdpConfigDialog; aqui se quedo el 'off' pelado al consolidar los cinco dialogos.
                */
                htmlInput: { autoComplete: esSecreto ? 'new-password' : 'off' },
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
                    {/* El resultado se queda a la vista hasta la siguiente prueba: es lo que se lee para corregir */}
                    {testOutcome && (
                        <Typography variant='caption' color={testOutcome.ok ? 'success.main' : 'error'} data-testid='config-test-result'>
                            {testOutcome.message}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {props.testEndpoint && (
                    <Button onClick={test} disabled={testing || saving || schema.length === 0} data-testid='config-test'
                        title='Asks the extension to check what you have typed, without saving it'>
                        {testing ? <CircularProgress size={16} /> : 'TEST'}
                    </Button>
                )}
                <Typography sx={{ flexGrow: 1 }} />
                <Button onClick={save} disabled={saving || testing || schema.length === 0}>{saving ? <CircularProgress size={16} /> : 'SAVE'}</Button>
                <Button onClick={props.onClose}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ConfigFormDialog }
