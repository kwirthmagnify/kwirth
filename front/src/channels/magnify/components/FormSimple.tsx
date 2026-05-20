import { Button, Checkbox, DialogActions, FormControlLabel, List, ListItem, Menu, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
import React, { useState, useEffect } from 'react'
import { objectClone } from '../Tools'

interface IFormSimpleProps {
    onApply: (values: any) => void
    onClose: () => void
    anchorParent: Element | null
    model: any
}

const FormSimple: React.FC<IFormSimpleProps> = (props: IFormSimpleProps) => {
    // Usamos estado en lugar de ref para que la UI reaccione automáticamente a los cambios
    const [formData, setFormData] = useState<any>(null)
    const [asyncResults, setAsyncResults] = useState<{ [key: string]: any }>({})

    // Sincronizar el estado interno cuando el modelo de las props cambie o se cargue
    useEffect(() => {
        if (props.model) {
            const clonedData = objectClone(props.model)
            setFormData(clonedData)

            // Disparar acciones asíncronas si existen
            Object.keys(clonedData).forEach(key => {
                const item = clonedData[key]
                // Verificamos que exista la acción asíncrona en el modelo original
                if (item && typeof item === 'object' && item.text && typeof props.model[key]?.asyncAction === 'function') {
                    props.model[key].asyncAction().then((result: any) => {
                        setAsyncResults(prev => ({ ...prev, [key]: result }))
                    })
                }
            })
        }
    }, [props.model])

    const handleChange = (key: string, newValue: any) => {
        setFormData((prev: any) => ({
            ...prev,
            [key]: newValue
        }))
    }

    const handleObjectValueChange = (key: string, subKey: string, newValue: any) => {
        setFormData((prev: any) => ({
            ...prev,
            [key]: {
                ...prev[key],
                [subKey]: newValue
            }
        }))
    }

    const apply = () => {
        if (formData) {
            props.onApply(objectClone(formData))
        }
    }

    // Si el modelo aún no existe, no renderizamos nada para evitar errores de Object.keys
    if (!formData) return null

    return (
        <Menu 
            open={Boolean(props.anchorParent)} 
            anchorEl={props.anchorParent} 
            onClose={props.onClose}
        >
            <Stack direction={'column'} width={'320px'} p={2} spacing={1.5}>
                {Object.keys(formData).map((key, index) => {
                    const value = formData[key]

                    return (
                        <Stack key={index} direction={'row'} alignItems={'center'} justifyContent={'space-between'} spacing={2}>
                            <Typography variant='body2' sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                                {key}:
                            </Typography>

                            {/* Booleano -> Switch */}
                            {typeof value === 'boolean' && (
                                <Switch 
                                    checked={value} 
                                    onChange={(e) => handleChange(key, e.target.checked)} 
                                />
                            )}

                            {/* Número -> TextField */}
                            {typeof value === 'number' && (
                                <TextField 
                                    type='number' 
                                    variant='standard' 
                                    value={value} 
                                    onChange={(e) => handleChange(key, Number(e.target.value))} 
                                    slotProps={{ htmlInput: { style: { textAlign: 'right', width: '80px' } } }}
                                />
                            )}

                            {/* Objeto con opciones -> Select */}
                            {value && typeof value === 'object' && value.options && value.value !== undefined && (
                                <Select 
                                    variant='standard' 
                                    value={value.value} 
                                    onChange={(e) => handleObjectValueChange(key, 'value', e.target.value)} 
                                    sx={{ minWidth: '100px' }}
                                >
                                    {value.options.map((opt: string, i: number) => (
                                        <MenuItem key={i} value={opt}>{opt}</MenuItem>
                                    ))}
                                </Select>
                            )}

                            {/* Objeto con botón -> Button */}
                            {value && typeof value === 'object' && value.button && (
                                <Button 
                                    variant='outlined' 
                                    size='small' 
                                    onClick={() => props.model[key].action()}
                                >
                                    {value.button}
                                </Button>
                            )}

                            {/* Objeto con texto asíncrono -> Typography */}
                            {value && typeof value === 'object' && value.text && (
                                <Typography variant='body2' color='text.secondary'>
                                    {asyncResults[key] !== undefined ? asyncResults[key] : '...'}
                                </Typography>
                            )}
                        {/* Array con available+value -> checklist */}
                        {value && typeof value === 'object' && Array.isArray(value.available) && Array.isArray(value.value) && (
                            <List dense disablePadding sx={{ maxHeight: 200, overflowY: 'auto', width: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 1, mt: 0.5 }}>
                                {value.available.map((item: string, i: number) => (
                                    <ListItem key={i} disablePadding sx={{ px: 1 }}>
                                        <FormControlLabel
                                            control={<Checkbox size='small' checked={value.value.includes(item)} onChange={(e) => {
                                                const next = e.target.checked
                                                    ? [...value.value, item]
                                                    : value.value.filter((v: string) => v !== item)
                                                handleObjectValueChange(key, 'value', next)
                                            }}/>}
                                            label={<Typography variant='caption'>{item}</Typography>}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                        </Stack>
                    )
                })}
            </Stack>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={props.onClose} color='inherit'>Cancel</Button>
                <Button onClick={apply} variant='contained' color='primary'>Apply</Button>
            </DialogActions>
        </Menu>
    )
}

export { FormSimple }
// import { Button, DialogActions, Menu, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
// import React, { useRef, useState, useEffect } from 'react'
// import { objectClone } from '../Tools'

// interface IFormSimpleProps {
//     onApply: (values: any) => void
//     onClose: () => void
//     anchorParent: Element | null
//     model: any
// }

// const FormSimple: React.FC<IFormSimpleProps> = (props: IFormSimpleProps) => {
//     const [, setRefresh] = useState(0)
//     const data = useRef<any>(objectClone(props.model))
//     const [asyncResults, setAsyncResults] = useState<{ [key: string]: any }>({})

//     useEffect(() => {
//         Object.keys(data.current).forEach(key => {
//             const item = data.current[key]
//             if (item && typeof item === 'object' && item.text && typeof props.model[key]?.asyncAction) {
//                 props.model[key].asyncAction().then((result: any) => {
//                     setAsyncResults(prev => ({ ...prev, [key]: result }))
//                 })
//             }
//         })
//     }, [])

//     const handleRefresh = () => setRefresh(prev => prev + 1)

//     const apply = () => {
//         props.onApply(objectClone(data.current))
//     }

//     return (
//         <Menu open={Boolean(props.anchorParent)} anchorEl={props.anchorParent} onClose={props.onClose}>
//             <Stack direction={'column'} width={'320px'} p={2} spacing={1.5}>
//                 {(data.current ? Object.keys(data.current) : []).map((key, index) => {
//                     const value = data.current[key]

//                     return (
//                         <Stack key={index} direction={'row'} alignItems={'center'} justifyContent={'space-between'} spacing={2}>
//                             <Typography variant='body2' sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
//                                 {key}:
//                             </Typography>

//                             {typeof value === 'boolean' && (
//                                 <Switch checked={value} onChange={(e) => { data.current[key] = e.target.checked; handleRefresh(); }} />
//                             )}

//                             {typeof value === 'number' && (
//                                 <TextField type='number' variant='standard' value={value} onChange={(e) => { data.current[key] = Number(e.target.value); handleRefresh(); }} slotProps={{ htmlInput: { style: { textAlign: 'right', width: '80px' } } }}/>
//                             )}

//                             {value && typeof value === 'object' && value.options && value.value !== undefined && (
//                                 <Select  variant='standard' value={value.value} onChange={(e) => { data.current[key].value = e.target.value; handleRefresh(); }} sx={{ minWidth: '100px' }}>
//                                     {value.options.map((opt: string, i: number) => (
//                                         <MenuItem key={i} value={opt}>{opt}</MenuItem>
//                                     ))}
//                                 </Select>
//                             )}

//                             {value && typeof value === 'object' && value.button && (
//                                 <Button variant='outlined' size='small' onClick={() => props.model[key].action()}>
//                                     {value.button}
//                                 </Button>
//                             )}

//                             {value && typeof value === 'object' && value.text && (
//                                 <Typography variant='body2' color='text.secondary'>
//                                     {asyncResults[key] !== undefined ? asyncResults[key] : '...'}
//                                 </Typography>
//                             )}
//                         </Stack>
//                     );
//                 })}
//             </Stack>

//             <DialogActions sx={{ p: 2 }}>
//                 <Button onClick={props.onClose} color='inherit'>Cancel</Button>
//                 <Button onClick={apply} variant='contained' color='primary'>Apply</Button>
//             </DialogActions>
//         </Menu>
//     )
// }

// export { FormSimple }