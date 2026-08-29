import React, { useState, useEffect, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { Settings } from '../../model/Settings'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'

interface IInstalledThemeEntry {
    id: string
    name: string
    displayName?: string
}

interface ISettingsUserProps {
    onClose:(ok:boolean) => void
    settings:Settings | null
    activeThemeName: string | undefined
    onThemeChange: (name: string | undefined) => void
}

const SettingsUser: React.FC<ISettingsUserProps> = (props:ISettingsUserProps) => {
    const [keepAliveInterval, setKeepAliveInterval] = useState<number>(props.settings? props.settings.keepAliveInterval : 60)
    const [selectedTheme, setSelectedTheme] = useState<string>(props.activeThemeName ?? '')
    const [themes, setThemes] = useState<IInstalledThemeEntry[]>([])
    const { backendUrl, accessString } = useContext(SessionContext) as SessionContextType

    useEffect(() => {
        fetch(`${backendUrl}/core/themes`, addGetAuthorization(accessString))
            .then(r => r.json())
            .then((data: IInstalledThemeEntry[]) => setThemes(data))
            .catch(() => {})
    }, [backendUrl, accessString])

    const ok = () =>{
        if (props.settings) {
            props.settings.keepAliveInterval = keepAliveInterval
            props.onThemeChange(selectedTheme === '' ? undefined : selectedTheme)
            props.onClose(true)
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='xs' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=user-settings-personal' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Settings</DialogTitleHelp>
            <DialogContent>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column', mt: 2 }}>
                    <Typography variant='body2'>
                        Default settings to use when you work with Kwirth.
                    </Typography>
                    <TextField value={keepAliveInterval} onChange={(e) => setKeepAliveInterval(+e.target.value)} variant='standard' label='Keep-alive interval (seconds)' slotProps={{ select: { native: true } }} type='number' />
                    <FormControl variant='standard'>
                        <InputLabel>Theme</InputLabel>
                        <Select value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value as string)} label='Theme'>
                            <MenuItem value=''>Default</MenuItem>
                            {themes.map(t => <MenuItem key={t.id} value={t.id}>{t.displayName || t.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(false)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsUser }
