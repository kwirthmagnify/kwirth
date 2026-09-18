import React, { useContext, useEffect, useState } from 'react'
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Divider, FormControl,
    IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, ContentCopy, Delete, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../../tools/AuthorizationManagement'

/*
    Gestor de las N CONFIGURACIONES CON NOMBRE de una extension: la lista a la izquierda, el formulario de
    la seleccionada a la derecha.

    No es el formulario de ConfigFormDialog, que edita LA configuracion de una extension (un login, un
    provider). Aqui una misma extension tiene varias configuraciones independientes —un sender con dos
    destinos, un webhook con una entrada por sistema que le llama— y cada una tiene nombre, se clona y se
    borra por separado. De ahi el chip 'N configs' de la tarjeta.

    Sirve a webhooks y a senders, que hablan exactamente los mismos endpoints bajo su `basePath`:
      GET  <basePath>/schema          el formulario que hay que pintar
      GET  <basePath>/configs         { configs: [...] }
      POST <basePath>/configs         crear o actualizar (el nombre va dentro)
      DEL  <basePath>/configs/<name>

    Lo que sea PROPIO de un tipo entra por `perConfigPanel`, que se pinta bajo el formulario y solo para
    configuraciones ya guardadas: webhooks enseña ahi la URL de ingesta con su token.
*/

// Una configuracion es lo que diga su schema: el core no conoce los campos de cada extension.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TConfigValues = Record<string, any>

/** Lo que recibe el panel propio del tipo. */
interface IPerConfigPanelProps {
    basePath: string
    configName: string
}

interface IConfigListDialogProps {
    title: string
    helpSection?: string
    /** Ruta del back de ESA extension, p.ej. '/core/webhooks/jira'. */
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
    // El nombre con el que la configuracion esta guardada AHORA. Es lo que distingue renombrar (hay
    // original y cambia) de clonar (no hay original), y sin el un clon borraria a su fuente.
    const [originalName, setOriginalName] = useState<string | undefined>()
    const [values, setValues] = useState<TConfigValues>({})
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | undefined>()
    const [revealed, setRevealed] = useState<Set<string>>(new Set())

    const reload = async () => {
        setLoading(true)
        try {
            const [configsRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}${props.basePath}/configs`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}${props.basePath}/schema`, addGetAuthorization(accessString))
            ])
            if (!configsRes.ok) throw new Error(`HTTP ${configsRes.status}`)
            const data = await configsRes.json()
            setConfigs(Array.isArray(data.configs) ? data.configs : [])
            if (schemaRes.ok) setSchema(await schemaRes.json())
        }
        catch (err) { setError(`Failed to load configs: ${err}`) }
        finally { setLoading(false) }
    }

    useEffect(() => { reload() }, [props.basePath])

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
        Clonar = quedarse con los valores y soltar el nombre original, pero sobre todo SIN `originalName`:
        eso es lo que distingue guardar una copia de renombrar la original, porque al guardar se borra la
        anterior cuando ese campo esta puesto y el nombre ha cambiado.
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
        ⚠️ Los campos vacios NO se envian, que es como funcionaba antes de unificar el diálogo. Vaciar un
        campo no lo borra: hay que borrar la configuracion entera. Se conserva a proposito — cambiarlo aqui
        tocaria a la vez el CRUD de webhooks y el de senders, que estan en uso — y queda anotado en el plan.

        Los `common` se quedan fuera: son de la EXTENSION, no de cada configuracion.
    */
    const buildPayload = (): TConfigValues => {
        const payload: TConfigValues = { name: values.name }
        for (const f of schema.filter(f => !f.common && f.name !== 'name')) {
            const v = values[f.name]
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else if (f.type === 'boolean') payload[f.name] = Boolean(v)
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
            // Renombrar es crear con el nombre nuevo y quitar el viejo: el back guarda por nombre.
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

    const campo = (f: IConfigFieldDef) => {
        const value = values[f.name] ?? (f.type === 'boolean' ? false : '')
        const onChange = (val: unknown) => setValues(prev => ({ ...prev, [f.name]: val }))

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

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '860px', height: '600px' } }}>
            <DialogTitleHelp section={props.helpSection ?? 'guide/extensions/index'} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{props.title}</DialogTitleHelp>
            <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

                {/* Izquierda: las configuraciones que hay */}
                <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
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
            <DialogActions sx={{ justifyContent: 'flex-end', px: 2 }}>
                <Button onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ConfigListDialog }
export type { IPerConfigPanelProps }
