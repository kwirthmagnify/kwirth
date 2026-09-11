import React, { useState } from 'react'
import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'

interface ISecretFieldProps {
    label: string
    value: string
    onChange: (value: string) => void
    helperText?: string
    disabled?: boolean
    width?: number | string
}

// Campo de credencial: oculto por defecto, con ojo para revelarlo. Lo que se escriba aqui acaba en un
// Secret, no en el ConfigMap (el back separa las dos mitades al guardar).
const SecretField: React.FC<ISecretFieldProps> = ({ label, value, onChange, helperText, disabled, width }) => {
    const [visible, setVisible] = useState(false)

    return <TextField size='small' label={label} value={value ?? ''} sx={{ width: width ?? 320 }}
        type={visible ? 'text' : 'password'}
        helperText={helperText}
        disabled={disabled === true}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        slotProps={{
            // Evita el autofill del navegador. Va en htmlInput y no como prop de TextField porque es
            // el atributo del <input> real lo que mira Chrome; el prop no siempre llega hasta ahi.
            htmlInput: { autoComplete: 'new-password' },
            input: {
                endAdornment: (
                    <InputAdornment position='end'>
                        <Tooltip title={visible ? 'Hide' : 'Show'}>
                            <IconButton size='small' edge='end' disabled={disabled === true} onClick={() => setVisible(!visible)}>
                                {visible ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        </Tooltip>
                    </InputAdornment>
                )
            }
        }} />
}

export default SecretField
