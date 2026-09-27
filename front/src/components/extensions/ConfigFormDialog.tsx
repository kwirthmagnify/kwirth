import React, { useContext, useEffect, useState } from 'react'
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, ListItemText, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    ONE configuration, as a form, built from the extension's `configSchema`.

    It is one of the four ways an extension has of being configured, and the files are named after that
    way: ConfigFormDialog (this one), ConfigListDialog (several, with names), ConfigJsonDialog (free JSON)
    and ConfigFrontDialog (painted by the extension itself).

    It was copied across FIVE management dialogs (logins, senders, providers, webhooks and IdP) with the
    same three branches —text, secret with an eye, dropdown— and the same loading and saving against
    `<endpoint>` (GET and PUT). It is pulled out here while migrating logins to the generic manager, so
    that the remaining ones inherit it instead of bringing their own copy.

    Secrets follow the project's rule: the back end returns the REAL value, the field arrives filled in
    and the only thing that changes is that it is shown with `type='password'` and an eye to reveal it.

    ⚠️ ALL the fields are sent, including the ones left empty. The previous copy omitted the empty ones,
    and that made it impossible to DELETE an already stored value: it was removed from the form, saved,
    and the back end carried on with the old one. An empty number IS omitted, because there is no number
    to send.
*/

interface IConfigFormDialogProps {
    /** The full title, e.g. 'Configure — Corporate login'. */
    title: string
    /** The guide's section for the help button. */
    helpSection?: string
    /*
        The form, in one of the two shapes the types have it:
          · `schema`, when the extension's metadata already brings it (logins)
          · `schemaEndpoint`, when it has to be asked for (providers, at <id>/schema)
    */
    schema?: IConfigFieldDef[]
    schemaEndpoint?: string
    /** The back-end route, relative to backendUrl: GET to read and PUT to save. */
    endpoint: string
    /*
        The check route, if the extension knows how to test its configuration (GET, answers {ok, message}).
        Present = the TEST button shows up. It is what makes it possible to know whether some credentials
        are any good without waiting for the provider to fail silently half an hour later.
    */
    testEndpoint?: string
    /** What to say when the extension has nothing configurable. */
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
    // What was loaded from the back end, to know whether the form is dirty (and not test what is unsaved)
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
            // With no configuration saved yet the form comes out with the schema's defaults.
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

    // What the form holds RIGHT NOW, in the format the extension expects. Saving and testing both use it.
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

    // Is there anything typed that is not saved? Then the test does not correspond to what is on screen.
    const dirty = (): boolean => Object.keys({ ...loaded, ...values }).some(k => (values[k] ?? '') !== (loaded[k] ?? ''))

    /*
        Testing the configuration. The test is done by the BACK END, which is the one with the
        credentials and the network.

        The DRAFT is sent by POST: what the user has in front of them is tested WITHOUT saving it, which
        is what the extensions bringing their own UI do. Forcing a save in order to test is asking them
        to write credentials that may well be wrong in order to find out whether they are wrong.

        ⛔ And this button does NOT save on its own: if the form had loaded incompletely —a field the back
        end does not return, a GET that fails— saving would leave the configuration worse than it was.

        An extension accepting only GET tests what is SAVED; then, and only then, a warning about pending
        changes is given. The dialog does not close: the point of the button is to correct and retest.
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
            // The extension answers 200 with {ok, message} even on failure, so its message arrives whole
            // rather than turning into an HTTP error with no detail.
            const body = await res.json().catch(() => undefined) as ITestOutcome | undefined
            if (body && typeof body.ok === 'boolean') setTestOutcome({ ok: body.ok, message: body.message || (body.ok ? 'Connection OK' : 'Test failed') })
            else setTestOutcome({ ok: false, message: `The extension did not answer the test (HTTP ${res.status})` })
        }
        catch (err) { setTestOutcome({ ok: false, message: `Could not run the test: ${err}` }) }
        finally { setTesting(false) }
    }

    const field = (f: IConfigFieldDef) => {
        // A boolean is a switch, not a text field with 'true' inside.
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
            Several values, stored as ONE comma-separated string: the configuration contract has no list
            type, and giving it one would mean migrating what is already stored in every artifact.

            The options come from the schema, which extensions may generate HOT —a cloud provider can
            discover its regions with the stored credentials. If the discovery bears no fruit, the list
            arrives empty; this then falls back to a text field and what is typed by hand still counts,
            which is exactly what is needed the first time, when there are no credentials to ask with yet.
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
                    Chrome IGNORES autocomplete='off' in what it believes to be a credentials form: on
                    seeing a type='password' it fills the PREVIOUS text field as if it were the username
                    ('admin' showed up in 'Client ID'). With 'new-password' it classifies it as creating
                    or changing a credential and stops autofilling both the secret and the field before
                    it. It is what ConfigListDialog and IdpConfigDialog already do; the bare 'off' was
                    left here when the five dialogs were consolidated.
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
