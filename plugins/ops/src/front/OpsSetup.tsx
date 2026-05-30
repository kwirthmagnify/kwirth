import React, { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Switch, Typography, Checkbox } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { Terminal } from '@mui/icons-material'
import { ESwitchKey, IOpsConfig, OpsConfig, OpsInstanceConfig } from './OpsConfig'
import { IOpsInstanceConfig } from './OpsTypes'

const OpsIcon = <Terminal />

const OpsSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    let opsInstanceConfig: IOpsInstanceConfig = props.setupConfig?.channelInstanceConfig || new OpsInstanceConfig()
    let opsConfig: IOpsConfig = props.setupConfig?.channelConfig || new OpsConfig()

    const [sessionKeepAlive, setSessionKeepAlive] = useState(opsInstanceConfig.sessionKeepAlive)
    const [accessKey, setAccessKey] = useState(opsConfig.accessKey || ESwitchKey.DISABLED)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const ok = () => {
        opsInstanceConfig.sessionKeepAlive = sessionKeepAlive
        opsConfig.accessKey = accessKey
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: opsConfig, channelInstanceConfig: opsInstanceConfig }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined }, false, false)
    }

    return (
        <Dialog open={true}>
            <DialogTitle>Configure Ops</DialogTitle>
            <DialogContent>
                <Stack sx={{ m: 2 }}>
                    <Stack direction='row' alignItems='center'>
                        <Typography>KeepAlive shell session on backend</Typography>
                        <Switch checked={sessionKeepAlive} onChange={(e) => setSessionKeepAlive(e.target.checked)} />
                    </Stack>
                    <Stack direction='row' alignItems='center'>
                        <Typography sx={{ flexGrow: 1 }}>Function access key</Typography>
                        <Select value={accessKey} onChange={(e) => setAccessKey(e.target.value as ESwitchKey)} variant='standard' sx={{ width: '150px', textAlign: 'center' }}>
                            <MenuItem value={ESwitchKey.DISABLED}>Disabled</MenuItem>
                            <MenuItem value={ESwitchKey.NONE}>None</MenuItem>
                            <MenuItem value={ESwitchKey.ALT}>Alt</MenuItem>
                            <MenuItem value={ESwitchKey.CTRL}>Control</MenuItem>
                            <MenuItem value={ESwitchKey.SHIFT}>Shift</MenuItem>
                        </Select>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button onClick={ok}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { OpsSetup, OpsIcon }
