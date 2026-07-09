import React from 'react'
import { Autocomplete, TextField, Chip } from '@mui/material'
import { IUserInfo } from '@kwirthmagnify/kwirth-common'

// Selector reutilizable de usuario Kwirth. Consume el catálogo de usuarios (IUserInfo, el subset seguro
// que expone IBackChannelObject.getUsers) y devuelve el id (email) del elegido. Muestra el name y, si el
// usuario viene de un IdP externo, un badge con el connector. Pensado para reemplazar los Autocomplete
// de usuario reimplementados por plugin (p.ej. Defender: ownership rules + assign owner).
//
// NOTA tsc: los genéricos de Autocomplete se fijan explícitos (IUserInfo, false×3) y renderOption usa un
// <li> plano (no <Box component="li">) para evitar la inferencia polimórfica que dispara el type-check.

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
                <li {...props} key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1 }}>{u.name}</span>
                    {u.idp && <Chip label={u.idp} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                </li>
            )}
            renderInput={p => <TextField {...p} label={label} />}
        />
    )
}

export { UserPicker }
