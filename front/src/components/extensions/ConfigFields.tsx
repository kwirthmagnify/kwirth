import React, { useState } from 'react'
import { Checkbox, FormControlLabel, IconButton, ListItemText, MenuItem, Switch, TextField } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'

/*
    Draws an `IConfigFieldDef[]` and nothing else: no loading, no saving, no dialog.

    It exists because the same renderer had been written twice —`field()` inside ConfigFormDialog and
    `campo()` inside IdpConfigDialog— and the two had already drifted: only one did multiselect, only one
    drew a number as a number. Whoever added a field type had to find both, and nobody ever did.

    Keeping it free of fetching is the point. ConfigFormDialog is tied to an endpoint (it GETs to load and
    PUTs to save), which is why it could not be reused for anything whose values do not live at an
    endpoint — a permission scope being composed in the security editor, for instance.
*/

interface IConfigFieldsProps {
    schema: IConfigFieldDef[]
    /** The current values, by field name. A string is accepted wherever a boolean or a number is expected. */
    values: Record<string, unknown>
    /*
        One field changed. The emitted value follows the field's type: a boolean for a switch, a number
        for a number, a string for everything else — including a multiselect, which travels as ONE
        comma-separated string (see below).

        ⚠️ An EMPTIED number emits '', not 0. They are not the same thing: the caller needs to tell apart
        'no value' —which is omitted when saving— from a zero somebody typed.
    */
    onChange: (name: string, value: unknown) => void
    /*
        The eye was pressed on a secret that was hidden, BEFORE revealing it. It is here because the two
        consumers mean different things by revealing: one just shows what is in the field, the other has
        to go and fetch the real value, because what it holds is a mask. Returning a promise holds the
        reveal back until it resolves.
    */
    onRevealSecret?: (name: string) => void | Promise<void>
}

const ConfigFields: React.FC<IConfigFieldsProps> = (props: IConfigFieldsProps) => {
    // Visibility is per field and lives here: it is presentation, and no consumer has ever needed it.
    const [shown, setShown] = useState<Record<string, boolean>>({})

    const toggleSecret = async (name: string) => {
        if (!shown[name] && props.onRevealSecret) await props.onRevealSecret(name)
        setShown(s => ({ ...s, [name]: !s[name] }))
    }

    const field = (f: IConfigFieldDef) => {
        // A boolean is a switch, not a text field with 'true' inside. The value is read as a string too,
        // because a form that keeps everything as text is one of the two consumers.
        if (f.type === 'boolean') {
            return (
                <FormControlLabel key={f.name} label={f.label}
                    control={<Switch size='small' checked={props.values[f.name] === true || props.values[f.name] === 'true'}
                        onChange={e => props.onChange(f.name, e.target.checked)} />} />
            )
        }

        const isSecret = f.type === 'password'
        const common = {
            label: f.label,
            value: props.values[f.name] ?? '',
            size: 'small' as const,
            fullWidth: true,
            required: f.required,
            sx: { '& .MuiOutlinedInput-root': { backgroundColor: 'transparent' } }
        }

        if (f.type === 'select') {
            return <TextField {...common} key={f.name} select onChange={e => props.onChange(f.name, e.target.value)}>
                {(f.options ?? []).map((opt, i) => <MenuItem key={opt} value={opt}>{f.labels?.[i] ?? opt}</MenuItem>)}
            </TextField>
        }

        /*
            Several values, stored as ONE comma-separated string: the configuration contract has no list
            type, and giving it one would mean migrating what is already stored in every artifact.

            The options come from the schema, which extensions may generate HOT —a cloud provider can
            discover its regions with the stored credentials. If the discovery bears no fruit the list
            arrives empty; this then falls back to a text field and what is typed by hand still counts,
            which is exactly what is needed the first time, when there are no credentials to ask with yet.
        */
        if (f.type === 'multiselect' && (f.options ?? []).length > 0) {
            const selected = String(props.values[f.name] ?? '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean)
            return <TextField {...common} key={f.name} select value={selected}
                slotProps={{ select: { multiple: true, renderValue: (v: unknown) => (v as string[]).join(', ') } }}
                onChange={e => props.onChange(f.name, (e.target.value as unknown as string[]).join(','))}>
                {/* With a CHECKBOX: it is what tells the user SEVERAL can be ticked. A dropdown that only
                    shades the chosen item looks like single selection. */}
                {(f.options ?? []).map((opt, i) => (
                    <MenuItem key={opt} value={opt} dense>
                        <Checkbox size='small' checked={selected.includes(opt)} sx={{ p: 0, mr: 1 }} />
                        <ListItemText primary={f.labels?.[i] ?? opt} slotProps={{ primary: { variant: 'body2' } }} />
                    </MenuItem>
                ))}
            </TextField>
        }

        return <TextField {...common} key={f.name}
            type={f.type === 'number' ? 'number' : (isSecret && !shown[f.name]) ? 'password' : 'text'}
            onChange={e => props.onChange(f.name, f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
            slotProps={{
                /*
                    Chrome IGNORES autocomplete='off' in what it believes to be a credentials form: on
                    seeing a type='password' it fills the PREVIOUS text field as if it were the username
                    ('admin' showed up in 'Client ID'). With 'new-password' it classifies it as creating
                    or changing a credential and stops autofilling both the secret and the field before it.
                */
                htmlInput: { autoComplete: isSecret ? 'new-password' : 'off' },
                ...(isSecret ? {
                    input: {
                        endAdornment: (
                            <IconButton size='small' edge='end' aria-label={shown[f.name] ? 'Hide' : 'Show'}
                                title={shown[f.name] ? 'Hide' : 'Show'} onClick={() => toggleSecret(f.name)}>
                                {shown[f.name] ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        )
                    }
                } : {})
            }}
        />
    }

    return <>{props.schema.map(f => field(f))}</>
}

export { ConfigFields }
