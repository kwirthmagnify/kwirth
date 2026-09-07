import React, { useState } from 'react'
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete } from '@mui/icons-material'

interface IHeaderEditorProps {
    headers: Record<string, string>
    onChange: (headers: Record<string, string>) => void
}

// Editor de cabeceras clave/valor. Las cabeceras de autenticacion NO se tocan aqui: las pone el back
// segun el modo de auth elegido, para que las credenciales no viajen mezcladas con el resto.
const HeaderEditor: React.FC<IHeaderEditorProps> = ({ headers, onChange }) => {
    const [name, setName] = useState('')
    const [value, setValue] = useState('')

    const entries = Object.entries(headers ?? {})

    const add = () => {
        const key = name.trim()
        if (!key) return
        onChange({ ...headers, [key]: value })
        setName('')
        setValue('')
    }

    const remove = (key: string) => {
        const next = { ...headers }
        delete next[key]
        onChange(next)
    }

    return <Box>
        <Typography variant='subtitle2' sx={{ mb: 1 }}>Headers</Typography>

        <Stack spacing={0.5} sx={{ mb: 1 }}>
            {entries.length === 0 &&
                <Typography variant='body2' color='text.secondary'>No headers.</Typography>
            }
            {entries.map(([key, val]) => (
                <Stack key={key} direction='row' alignItems='center' spacing={1}
                    sx={{ px: 1, py: 0.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant='body2' sx={{ fontWeight: 500, minWidth: 140 }}>{key}</Typography>
                    <Typography variant='body2' sx={{ flex: 1, wordBreak: 'break-all' }}>{val}</Typography>
                    <Tooltip title='Remove header'>
                        <IconButton size='small' color='error' onClick={() => remove(key)}>
                            <Delete fontSize='small' />
                        </IconButton>
                    </Tooltip>
                </Stack>
            ))}
        </Stack>

        <Stack direction='row' spacing={1} alignItems='center'>
            <TextField size='small' label='Name' value={name} sx={{ width: 180 }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
            <TextField size='small' label='Value' value={value} sx={{ flex: 1 }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} />
            <Tooltip title='Add header'>
                <span>
                    <IconButton size='small' onClick={add} disabled={!name.trim()}>
                        <Add fontSize='small' />
                    </IconButton>
                </span>
            </Tooltip>
        </Stack>
    </Box>
}

export default HeaderEditor
