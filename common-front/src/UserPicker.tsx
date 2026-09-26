import React from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { IUserInfo } from '@kwirthmagnify/kwirth-common'

// A reusable Kwirth user selector. It consumes the user catalogue (IUserInfo, the safe subset exposed by
// IBackChannelObject.getUsers) and returns the id (email) of the chosen one. It shows the name and, when
// the user comes from an external IdP, a badge with the connector. Meant to replace the user
// Autocompletes reimplemented plugin by plugin (Defender, for instance: ownership rules + assign owner).
//
// tsc NOTE: Autocomplete's generics are pinned explicitly (IUserInfo, false×3) and renderOption uses a
// plain <li> (not <Box component="li">) to avoid the polymorphic inference that blows up the type-check.

export interface IUserPickerProps {
    users: IUserInfo[]
    value?: string                              // id (email) del usuario seleccionado
    onChange: (id: string | undefined) => void  // undefined = deseleccionado
    label?: string
    size?: 'small' | 'medium'
    fullWidth?: boolean
    disabled?: boolean
}

const UserPicker: React.FC<IUserPickerProps> = ({ users, value, onChange, label = 'User', size = 'small', fullWidth, disabled }) => {
    const selected = users.find(u => u.id === value) ?? null
    return (
        <Autocomplete<IUserInfo, false, false, false>
            options={users}
            value={selected}
            disabled={disabled}
            size={size}
            fullWidth={fullWidth}
            getOptionLabel={u => u.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_e, u) => onChange(u?.id)}
            renderOption={(props, u) => (
                <li {...props} key={u.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                    <span>{u.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{[u.id, u.idp].filter(Boolean).join(' · ')}</span>
                </li>
            )}
            renderInput={p => <TextField {...p} label={label} />}
        />
    )
}

export { UserPicker }
