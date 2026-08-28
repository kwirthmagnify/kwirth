import React, { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { ISetupProps, MsgBoxOk, MsgBoxOkError, MsgBoxWaitCancel } from '@kwirthmagnify/kwirth-common-front'
import { TrivyConfig, TrivyInstanceConfig } from './TrivyConfig'
import VerifiedUser from '@mui/icons-material/VerifiedUser'
import { TrivyOperator } from './TrivyOperator'
import { ITrivyData } from './TrivyData'
import { ITrivyConfig, ITrivyInstanceConfig } from '../common/TrivyTypes'

const addGetAuthorization = (accessString: string) => ({ headers: { 'Authorization': 'Bearer ' + accessString } })

const TrivyIcon = <VerifiedUser />

const TrivySetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    let trivyInstanceConfig: ITrivyInstanceConfig = props.setupConfig?.channelInstanceConfig || new TrivyInstanceConfig()
    let trivyConfig: ITrivyConfig = props.setupConfig?.channelConfig || new TrivyConfig()
    let trivyData: ITrivyData = props.channelObject.data as ITrivyData

    const [ignoreCritical, setIgnoreCritical] = useState(trivyInstanceConfig.ignoreCritical || false)
    const [ignoreHigh, setIgnoreHigh] = useState(trivyInstanceConfig.ignoreHigh || false)
    const [ignoreMedium, setIgnoreMedium] = useState(trivyInstanceConfig.ignoreMedium ? true : false)
    const [ignoreLow, setIgnoreLow] = useState(trivyInstanceConfig.ignoreLow ? true : false)
    const [msgBox, setMsgBox] = useState(<></>)
    const [showOperatorManage, setShowOperatorManage] = useState<boolean>(false)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const ok = () => {
        trivyInstanceConfig.ignoreCritical = ignoreCritical
        trivyInstanceConfig.ignoreHigh = ignoreHigh
        trivyInstanceConfig.ignoreMedium = ignoreMedium
        trivyInstanceConfig.ignoreLow = ignoreLow
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: trivyConfig, channelInstanceConfig: trivyInstanceConfig }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined }, false, false)
    }

    const onOperatorManageClosed = async (action?: string) => {
        setShowOperatorManage(false)
        if (action) {
            setMsgBox(MsgBoxWaitCancel('Manage Trivy', `We are waiting for the action to complete...`, setMsgBox))
            const result = await fetch(`${props.channelObject.clusterUrl}/${trivyData.ri}/channel/trivy/operator?action=${action}`, addGetAuthorization(props.channelObject.accessString!))
            if (result.status === 200)
                setMsgBox(MsgBoxOk('Trivy', `Action '${action}' successfully sent, check results on your cluster.`, setMsgBox))
            else
                setMsgBox(MsgBoxOkError('Trivy', `Trivy action has shown some errors: ${await result.text()}.`, setMsgBox))
        }
    }

    return (<>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '28vw', minWidth: '500px', maxWidth: '50vw', height: '55vh' } }}>
            <DialogTitle>Configure Trivy channel</DialogTitle>
            <DialogContent>
                <Stack direction='column' justifyContent='space-between' height='100%'>
                    <Stack spacing={2} direction='column' sx={{ mt: '16px' }}>
                        <Typography>Activate or deactivate severities for including or excluding them from Trivy reports:</Typography>
                        <Stack direction='column'>
                            <Stack direction='row' alignItems='center'>
                                <Typography flex={1} />
                                <Typography>Ignore</Typography>
                            </Stack>
                            {[['Critical', ignoreCritical, setIgnoreCritical], ['High', ignoreHigh, setIgnoreHigh], ['Medium', ignoreMedium, setIgnoreMedium], ['Low', ignoreLow, setIgnoreLow]].map(([label, val, setter]) => (
                                <Stack key={label as string} direction='row' alignItems='center'>
                                    <Typography flex={1} fontWeight={800} width='80px'>{label as string}</Typography>
                                    <Checkbox checked={val as boolean} onChange={() => (setter as Function)(!val)} />
                                </Stack>
                            ))}
                        </Stack>
                    </Stack>
                    <Stack direction='row'>
                        <Stack direction='column'>
                            <Typography>You can manage your cluster Trivy installation from Kwirth.</Typography>
                            <Typography fontSize='10px'>You need to start the channel at least once in order to be able to configure Trivy operator.</Typography>
                        </Stack>
                        <Typography flex={1} />
                        <Button variant='outlined' onClick={() => setShowOperatorManage(true)} disabled={!trivyData.ri}>Manage Trivy</Button>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
        {showOperatorManage && <TrivyOperator onClose={onOperatorManageClosed} clusterUrl={props.channelObject.clusterUrl!} accessString={props.channelObject.accessString!} channelObject={props.channelObject} />}
        {msgBox}
    </>)
}

export { TrivySetup, TrivyIcon }
