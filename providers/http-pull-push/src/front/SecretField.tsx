import React, { useState } from 'react'
import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'

interface ISecretFieldProps {
    label: string
    value: string
    onChange: (value: string) => void
    width?: number | string
}

// Campo de credencial: oculto por defecto, con ojo para revelarlo. Lo que se escriba aqui acaba en un
// Secret, no en el ConfigMap (el back separa las dos mitades al guardar).
const SecretField: React.FC<ISecretFieldProps> = ({ label, value, onChange, width }) => {
    const [visible, setVisible] = useState(false)

    return <TextField size='small' label={label} value={value ?? ''} sx={{ width: width ?? 260 }}
        type={visible ? 'text' : 'password'}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        slotProps={{
            input: {
                endAdornment: (
                    <InputAdornment position='end'>
                        <Tooltip title={visible ? 'Hide' : 'Show'}>
                            <IconButton size='small' edge='end' onClick={() => setVisible(!visible)}>
                                {visible ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        </Tooltip>
                    </InputAdornment>
                )
            }
        }} />
}

export default SecretField
