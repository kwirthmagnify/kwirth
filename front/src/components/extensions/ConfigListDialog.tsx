import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, Divider, FormControl,
    FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Switch, TextField,
    Tooltip, Typography
} from '@mui/material'
import { Add, ContentCopy, Delete, Download, Settings, Upload, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    The manager of an extension's N NAMED CONFIGURATIONS: the list on the left, the selected one's form
    on the right.

    It is not ConfigFormDialog's form, which edits THE configuration of an extension (a login, a
    provider). Here one and the same extension has several independent configurations —a sender with two
    destinations, a webhook with one entry per system that calls it— and each has a name, is cloned and
    is deleted separately. Hence the card's 'N configs' chip.

    It serves webhooks and senders, which speak exactly the same endpoints under their `basePath`:
      GET  <basePath>/schema          the form to be painted
      GET  <basePath>/configs         { configs: [...] }
      POST <basePath>/configs         create or update (the name goes inside)
      DEL  <basePath>/configs/<name>

    The document the back end stores is `{ ...commonFields, configs: [...] }`. The COMMON fields are the
    ones the schema marks with `common`: they belong to the extension and not to each configuration — the
    mail server is one, and the recipients are many. They are edited apart, on their own screen, and it
    only shows up if the schema declares any.

    Whatever is a type's OWN comes in through `perConfigPanel`, which is painted below the form and only
    for configurations already saved: webhooks shows the ingest URL with its token there.
*/

// A configuration is whatever its schema says: the core does not know each extension's fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TConfigValues = Record<string, any>

/** What the type's own panel receives. */
interface IPerConfigPanelProps {
    basePath: string
    configName: string
}

interface IConfigListDialogProps {
    title: string
    helpSection?: string
    /*
        This extension's OWN help page, if it exists. It is genuinely checked —a HEAD to the .md— and if
        it is not there, `helpSection` is used. That way publishing a sender's reference links it by
        itself, without touching the front end or keeping a separate list of who has one.
    */
    preferredHelpSection?: string
    /** THAT extension's back-end route, e.g. '/core/webhooks/jira'. */
    basePath: string
    onClose: () => void
    perConfigPanel?: React.ComponentType<IPerConfigPanelProps>
}

const ConfigListDialog: React.FC<IConfigListDialogProps> = (props: IConfigListDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [schema, setSchema] = useState<IConfigFieldDef[]>([])
    const [configs, setConfigs] = useState<TConfigValues[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | undefined>()

    const [showForm, setShowForm] = useState(false)
    const [editingName, setEditingName] = useState<string | undefined>()
    // The name the configuration is stored under RIGHT NOW. It is what tells renaming (there is an
    // original and it changes) from cloning (there is no original), and without it a clone would delete
    // its source.
    const [originalName, setOriginalName] = useState<string | undefined>()
    const [values, setValues] = useState<TConfigValues>({})
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | undefined>()
    const [revealed, setRevealed] = useState<Set<string>>(new Set())

    // The extension's COMMON fields, which belong to no configuration in particular.
    const [base, setBase] = useState<TConfigValues>({})
    const [baseOpen, setBaseOpen] = useState(false)
    const [savingBase, setSavingBase] = useState(false)
    const [ayuda, setAyuda] = useState(props.helpSection)

    const reload = async () => {
        setLoading(true)
        try {
            const [configsRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}${props.basePath}/configs`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}${props.basePath}/schema`, addGetAuthorization(accessString))
            ])
            if (!configsRes.ok) throw new Error(`HTTP ${configsRes.status}`)
            // The document carries the configurations and, at the same level, the common fields.
            const { configs: guardadas, ...comunes } = await configsRes.json()
            setConfigs(Array.isArray(guardadas) ? guardadas : [])
            setBase(comunes)
            if (schemaRes.ok) setSchema(await schemaRes.json())
        }
        catch (err) { setError(`Failed to load configs: ${err}`) }
        finally { setLoading(false) }
    }

    useEffect(() => { reload() }, [props.basePath])

    /*
        The help points at THIS extension's page if it exists. It is checked with a HEAD instead of
        keeping a list: publishing a sender's reference links it by itself.
    */
    useEffect(() => {
        const propia = props.preferredHelpSection
        if (!propia) return
        const comprobar = async () => {
            try {
                const res = await fetch(`${backendUrl}/core/docs/core/kwirth/${propia}.md`, { method: 'HEAD' })
                if (res.ok) setAyuda(propia)
            }
            catch { /* sin pagina propia se queda la general, que es la que ya estaba puesta */ }
        }
        comprobar()
    }, [backendUrl, props.preferredHelpSection])

    /** The common fields, which belong to the extension and not to each configuration. */
    const camposComunes = schema.filter(f => f.common)

    /*
        The base is saved with the WHOLE document: the back end receives the common fields and the
        configurations together, so sending only the common ones would delete the configurations.
    */
    const guardarBase = async () => {
        setSavingBase(true)
        setError(undefined)
        try {
            const comunes: TConfigValues = {}
            for (const f of camposComunes) {
                const v = base[f.name]
                // a boolean is always saved, turned off too (see buildPayload)
                if (f.type === 'boolean') { comunes[f.name] = Boolean(v); continue }
                if (v === undefined || v === '') continue
                if (f.type === 'number') comunes[f.name] = Number(v)
                else comunes[f.name] = v
            }
            const res = await fetch(`${backendUrl}${props.basePath}/configs`, addPutAuthorization(accessString, JSON.stringify({ ...comunes, configs })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setBaseOpen(false)
            await reload()
        }
        catch (err) { setError(`Save failed: ${err}`) }
        finally { setSavingBase(false) }
    }

    const baseValida = (): boolean => camposComunes.filter(f => f.required).every(f => {
        const v = base[f.name]
        return v !== undefined && v !== '' && v !== false
    })

    /*
        🔴 Aqui vivian `exportar`, `abrirImportacion` y `confirmarImportacion`, y se fueron en el mismo
        cambio que los botones del pie (ver el comentario en DialogActions). Lo que importa recordar:

        · el export serializaba las configuraciones TAL CUAL, asi que las contraseñas salian EN CLARO;
        · el import FUSIONABA —añadia y sobrescribia por nombre, sin quitar nada— mientras que el
          bundle de Kwirth reemplaza. El mismo contenido dejaba el sistema de dos formas distintas
          segun por donde entrara.

        Las configuraciones de senders y webhooks viajan ahora por ☰ Kwirth export, que las vacia por
        `getConfigSchema()` salvo que se marquen las credenciales.
    */

    const editar = (cfg: TConfigValues) => {
        setEditingName(cfg.name)
        setOriginalName(cfg.name)
        setValues({ ...cfg })
        setShowForm(true)
    }

    const nueva = () => {
        setEditingName(undefined)
        setOriginalName(undefined)
        setValues({})
        setShowForm(true)
    }

    /*
        Cloning = keeping the values and dropping the original name, but above all WITHOUT
        `originalName`: that is what tells saving a copy from renaming the original, because on saving
        the previous one is deleted when that field is set and the name has changed.
    */
    const clonar = () => {
        setEditingName(undefined)
        setOriginalName(undefined)
        setValues({ ...values, name: `${values.name ?? ''} (copy)` })
        setShowForm(true)
    }

    const cerrarForm = () => {
        setShowForm(false)
        setEditingName(undefined)
        setOriginalName(undefined)
        setValues({})
    }

    const borrar = async (name: string) => {
        setDeleting(name)
        try {
            const res = await fetch(`${backendUrl}${props.basePath}/configs/${encodeURIComponent(name)}`, addDeleteAuthorization(accessString))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setConfigs(prev => prev.filter(c => c.name !== name))
            if (editingName === name) cerrarForm()
        }
        catch (err) { setError(`Delete failed: ${err}`) }
        finally { setDeleting(undefined) }
    }

    /*
        ⚠️ Empty fields are NOT sent, which is how it worked before the dialog was unified. Emptying a
        field does not delete it: the whole configuration has to be deleted. It is kept on purpose —
        changing it here would touch both webhooks' and senders' CRUD at once, and they are in use — and
        it is written down in the plan.

        The `common` ones stay out: they belong to the EXTENSION, not to each configuration.
    */
    const buildPayload = (): TConfigValues => {
        const payload: TConfigValues = { name: values.name }
        for (const f of schema.filter(f => !f.common && f.name !== 'name')) {
            const v = values[f.name]
            /*
                A boolean is ALWAYS saved, including when it is switched off.

                Skipping it as "empty" turned switched-off into ABSENT, and an extension with a field
                whose default is true switched it back on: the toggle looked off and the behaviour was
                that of on. What is seen has to be what is saved.
            */
            if (f.type === 'boolean') { payload[f.name] = Boolean(v); continue }
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else payload[f.name] = v
        }
        if (values.description !== undefined && values.description !== '') payload.description = values.description
        return payload
    }

    const formValido = (): boolean => {
        if (!values.name) return false
        return schema.filter(f => f.required && !f.common && f.name !== 'name').every(f => {
            const v = values[f.name]
            return v !== undefined && v !== '' && v !== false
        })
    }

    const guardar = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const payload = buildPayload()
            const nuevoNombre = payload.name as string
            const res = await fetch(`${backendUrl}${props.basePath}/configs`, addPostAuthorization(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            // Renaming is creating under the new name and removing the old one: the back end stores by name.
            if (originalName && originalName !== nuevoNombre) {
                await fetch(`${backendUrl}${props.basePath}/configs/${encodeURIComponent(originalName)}`, addDeleteAuthorization(accessString))
            }
            setEditingName(nuevoNombre)
            setOriginalName(nuevoNombre)
            await reload()
        }
        catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

    const toggleSecret = (name: string) => setRevealed(prev => {
        const n = new Set(prev)
        if (n.has(name)) n.delete(name)
        else n.add(name)
        return n
    })

    /*
        One field of the schema. It receives WHERE it reads from and writes to because the same fields
        are painted in two places: the selected configuration and the extension's common base.
    */
    const campo = (f: IConfigFieldDef, valores: TConfigValues = values, escribir?: (name: string, val: unknown) => void) => {
        const value = valores[f.name] ?? (f.type === 'boolean' ? false : '')
        const onChange = (val: unknown) => {
            if (escribir) escribir(f.name, val)
            else setValues(prev => ({ ...prev, [f.name]: val }))
        }

        if (f.type === 'boolean') {
            return (
                <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant='body2'>{f.label}</Typography>
                    <Switch size='small' checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
                </Box>
            )
        }

        if (f.type === 'select' && f.options) {
            return (
                <FormControl key={f.name} size='small' fullWidth>
                    <InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
                    <Select label={`${f.label}${f.required ? ' *' : ''}`} value={value || ''} displayEmpty onChange={e => onChange(e.target.value)}>
                        <MenuItem value=''><em>—</em></MenuItem>
                        {f.options.map((o, i) => <MenuItem key={o} value={o}>{f.labels?.[i] ?? o}</MenuItem>)}
                    </Select>
                </FormControl>
            )
        }

        const esSecreto = f.type === 'password'
        const visible = revealed.has(f.name)
        return (
            <TextField key={f.name} size='small' fullWidth
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.type === 'number' ? 'number' : (esSecreto && !visible) ? 'password' : 'text'}
                autoComplete={esSecreto ? 'new-password' : 'off'}
                value={value}
                onChange={e => onChange(e.target.value)}
                slotProps={{ input: esSecreto ? {
                    endAdornment: (
                        <InputAdornment position='end'>
                            <IconButton size='small' edge='end' aria-label={visible ? 'Hide' : 'Show'} onClick={() => toggleSecret(f.name)}>
                                {visible ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        </InputAdornment>
                    )
                } : undefined }}
            />
        )
    }

    const PerConfigPanel = props.perConfigPanel

    return (<>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '860px', height: '600px' } }}>
            <DialogTitleHelp section={ayuda ?? 'guide/extensions/index'} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
            <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

                {/* Izquierda: las configuraciones que hay */}
                <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <Stack direction='row' alignItems='center' justifyContent='space-between'>
                        <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
                        {/* Lo comun a todas las configuraciones se edita aparte, y el acceso solo aparece
                            si la extension declara algun campo asi. */}
                        {camposComunes.length > 0 && (
                            <Tooltip title='Edit base configuration'>
                                <IconButton size='small' aria-label='Edit base configuration' onClick={() => setBaseOpen(true)}><Settings sx={{ fontSize: 16 }} /></IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                    <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                        {loading
                            ? <Box sx={{ p: 1 }}><CircularProgress size={16} /></Box>
                            : configs.length === 0
                                ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No configs yet.</Typography>
                                : configs.map(cfg => (
                                    <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', borderLeft: editingName === cfg.name ? 3 : 0, borderLeftColor: 'primary.main', bgcolor: editingName === cfg.name ? 'action.selected' : 'transparent' }}>
                                        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => editar(cfg)}>
                                            <Typography variant='body2' fontWeight='bold' noWrap>{cfg.name}</Typography>
                                        </Box>
                                        <Tooltip title='Delete'>
                                            <span>
                                                <IconButton size='small' color='error' aria-label='Delete' disabled={deleting === cfg.name} onClick={() => borrar(cfg.name)}>
                                                    {deleting === cfg.name ? <CircularProgress size={12} /> : <Delete sx={{ fontSize: 14 }} />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))
                        }
                    </Box>
                    <Stack direction='row' spacing={0.5}>
                        <Button size='small' startIcon={<Add />} onClick={nueva} sx={{ flex: 1 }}>New</Button>
                        <Button size='small' startIcon={<ContentCopy />} disabled={!editingName} onClick={clonar} sx={{ flex: 1 }}>Clone</Button>
                    </Stack>
                </Box>

                <Divider orientation='vertical' flexItem />

                {/* Derecha: la configuracion seleccionada */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
                    {showForm
                        ? <>
                            <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                                {editingName ? `Editing: ${editingName}` : 'New config'}
                            </Typography>
                            <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
                                <Stack direction='column' spacing={1.5}>
                                    {schema.filter(f => f.name === 'name').map(f => campo(f))}
                                    <TextField size='small' label='Description' fullWidth multiline maxRows={2}
                                        value={values.description ?? ''}
                                        onChange={e => setValues(prev => ({ ...prev, description: e.target.value || undefined }))} />
                                    {schema.filter(f => f.name !== 'name' && !f.common).map(f => campo(f))}

                                    {/* Lo propio del tipo, solo cuando la configuracion ya existe: antes de
                                        guardarla no hay nada a lo que referirse (ni token, ni URL). */}
                                    {PerConfigPanel && originalName && <PerConfigPanel basePath={props.basePath} configName={originalName} />}
                                </Stack>
                            </Box>
                            <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
                                {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
                                <Button size='small' variant='contained' disabled={saving || !formValido()} onClick={guardar}>
                                    {saving ? <CircularProgress size={14} /> : editingName ? 'Update' : 'Add'}
                                </Button>
                                <Button size='small' onClick={cerrarForm}>Cancel</Button>
                            </Stack>
                          </>
                        : <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                            <Typography variant='body2'>Select a config to edit or click New.</Typography>
                          </Box>
                    }
                </Box>
            </DialogContent>
            {/*
                Aqui estaban Export e Import, y se fueron por dos razones.

                🔴 La primera es que el Export escribia LAS CONTRASEÑAS EN CLARO. Serializaba las
                configuraciones tal cual, sin casilla de credenciales y sin aviso de ninguna clase, asi
                que exportar las de SMTP dejaba la contraseña del servidor de correo en un fichero en la
                carpeta de descargas. El bundle las vacia por `getConfigSchema()` salvo que se marquen.

                La segunda, que eran una SEGUNDA PUERTA al mismo almacen: ☰ Kwirth export ya se lleva
                las configuraciones de senders y webhooks, y tener dos obligaba a investigar cual
                exportaba que — ademas de discrepar, porque aquella fusionaba y el bundle reemplaza.
            */}
            <DialogActions sx={{ justifyContent: 'flex-end', px: 2 }}>
                <Button onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>

        {/* Lo comun a todas las configuraciones: el servidor de correo es uno, los destinatarios varios. */}
        {baseOpen && (
            <Dialog open maxWidth='sm' fullWidth>
                <DialogTitleHelp section={ayuda ?? 'guide/extensions/index'} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Base configuration</DialogTitleHelp>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {camposComunes.map(f => campo(f, base, (name, val) => setBase(prev => ({ ...prev, [name]: val }))))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button variant='contained' disabled={savingBase || !baseValida()} onClick={guardarBase}>
                        {savingBase ? <CircularProgress size={14} /> : 'Save'}
                    </Button>
                    {/* Cancelar recarga: lo tecleado y no guardado no puede quedarse en pantalla como si
                        estuviera puesto. */}
                    <Button onClick={() => { setBaseOpen(false); reload() }}>Cancel</Button>
                </DialogActions>
            </Dialog>
        )}

    </>)
}

export { ConfigListDialog }
export type { IPerConfigPanelProps }
