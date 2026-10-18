import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { IExtensionScope, buildThinScope } from '@kwirthmagnify/kwirth-common'
import { ConfigFields } from '../extensions/ConfigFields'

/*
    Narrowing ONE scope: the form a channel declares so a permission can be granted over part of what it
    governs instead of over all of it.

    What comes out is a scope, and which of the two forms depends on what is filled in:
      · something  → the thin token `channel#scope#<b64>`
      · nothing    → the plain `channel$scope`, exactly as before

    🔴 That second case is not a detail. A channel declaring `config` must not make its WIDE form
    unreachable: 'read everything' is a legitimate permission, and the day it can only be granted by
    typing a token by hand, nobody grants it.
*/

interface IScopeConfigDialogProps {
    /** The catalogue entry being narrowed. Its `config`, if any, is the form. */
    entry: IExtensionScope
    /** The configuration already stored, when an existing thin scope is being reopened. */
    initial?: unknown
    /** The composed scope: a thin token, or the wide scope when nothing was filled in. */
    onAccept: (scope: string) => void
    onClose: () => void
}

/*
    The default when the channel declares no form: ONE free field, which is what the PRD asks for. It
    covers a path, a regex or a comma-separated list without the channel having to describe them, and it
    is what makes a thin scope grantable the day a channel starts reading them but has not yet got round
    to declaring its fields.
*/
const FREE_FIELD = 'value'

const ScopeConfigDialog: React.FC<IScopeConfigDialogProps> = (props: IScopeConfigDialogProps) => {
    const declared = props.entry.config ?? []
    const isFree = declared.length === 0

    const [values, setValues] = useState<Record<string, unknown>>(() => {
        if (props.initial === undefined || props.initial === null) return {}
        // A free-field config was stored as a bare value; a declared one, as an object by field name.
        if (isFree) return { [FREE_FIELD]: String(props.initial) }
        return typeof props.initial === 'object' ? { ...props.initial as Record<string, unknown> } : {}
    })

    const setField = (name: string, value: unknown) => setValues(v => ({ ...v, [name]: value }))

    // Blank is blank whatever the field: an empty string, an empty list, nothing typed at all.
    const filled = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== ''
    const anyFilled = Object.values(values).some(filled)

    const accept = () => {
        const [channel, scope] = props.entry.scope.split('$')
        if (!anyFilled) {
            props.onAccept(props.entry.scope)
            return
        }
        // Only what was filled in travels: an empty field is not a value, and storing it would make the
        // channel decide what an empty path means.
        const config: unknown = isFree
            ? String(values[FREE_FIELD] ?? '').trim()
            : Object.fromEntries(Object.entries(values).filter(([, v]) => filled(v)))
        props.onAccept(buildThinScope(channel, scope, config))
    }

    return (
        <Dialog open onClose={props.onClose} maxWidth={false} slotProps={{ paper: { sx: { width: 520 } } }}>
            <DialogTitle>Narrow: {props.entry.label}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='caption' color='text.secondary'>
                        {props.entry.description}
                    </Typography>
                    {isFree
                        ? <TextField size='small' fullWidth label='Limit to' autoFocus
                            value={values[FREE_FIELD] ?? ''}
                            onChange={e => setField(FREE_FIELD, e.target.value)}
                            helperText='A path, a regular expression or a comma-separated list — whatever this channel understands.' />
                        : <ConfigFields schema={declared} values={values} onChange={setField} />}
                    {/* Said before saving, not after: leaving it blank grants the whole scope, which is
                        the opposite of what somebody who opened THIS dialog probably intended. */}
                    {!anyFilled && (
                        <Typography variant='caption' color='warning.main'>
                            Nothing filled in — this grants <b>{props.entry.scope}</b> over everything.
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, gap: 1 }}>
                <Button onClick={accept} variant='contained'>Save</Button>
                <Button onClick={props.onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ScopeConfigDialog }
