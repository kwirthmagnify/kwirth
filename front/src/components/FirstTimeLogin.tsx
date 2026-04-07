import React, { useState, useContext } from 'react'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material'
import { AccessKey, accessKeySerialize, ApiKey } from '@kwirthmagnify/kwirth-common'
import { addPostAuthorization } from '../tools/AuthorizationManagement'
import { MsgBoxOk } from '../tools/MsgBox'
import { v4 as uuid } from 'uuid'

const copy = require('clipboard-copy')

interface IFirstTimeLoginProps {
    onClose: (exit:boolean) => void
}

const FirstTimeLogin: React.FC<IFirstTimeLoginProps> = (props:IFirstTimeLoginProps) => {
    const {accessString, backendUrl} = useContext(SessionContext) as SessionContextType;
    const [msgBox, setMsgBox] = useState(<></>)

    const onClickYes = async () => {
        let accessKey:AccessKey = { type: 'permanent', resources: 'cluster::::', id: uuid() }
        let apiKey:ApiKey = { accessKey, description:'Key for Backstage to access Kwirth', expire: Date.now() + 365*24*60*60*1000, days: 365 }
        let payload = JSON.stringify(apiKey)
        let resp = await fetch(`${backendUrl}/key`, addPostAuthorization(accessString, payload))
        let jresp = await resp.json()
        copy(accessKeySerialize(jresp.accessKey))
        setMsgBox(MsgBoxOk('Create access key', 'Access key has been created and is now on the clipboard. You can paste it on your app-config Backstage YAML file. You will now be logged out from Kwirth.', () => {props.onClose(true)} ))
    }

    const onClickNo = async () => {
        props.onClose(false)
    }

    return (<>
        <Dialog open={true} disableRestoreFocus={true} fullWidth maxWidth={'md'}>
            <DialogTitle>First time here...</DialogTitle>
            <DialogContent>
                <Typography>
                    It seems that this is your first time here. If you are installing Kwirth just for use with <b>Backstage</b> Kubelog,
                    or a Backstage Kwirth plugin (KwirthMetrics, KwirthLog, KwirthSecurity...) you can create your API Key now
                    and <b>exit Kwirth</b> (I think you should take a look on what Kwirth can do for you, but it is not needed).
                    <br/>
                    <br/>
                    Do you want to <b>create API Key</b> for use within Backstage?
                </Typography>
            </DialogContent>
            <DialogActions>
                <Typography sx={{ flexGrow:1}}></Typography>
                <Button onClick={onClickYes}>Yes</Button>
                <Button onClick={onClickNo}>No</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { FirstTimeLogin }
