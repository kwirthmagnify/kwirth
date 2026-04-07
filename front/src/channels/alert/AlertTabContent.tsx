import { Box, Card, CardContent, CardHeader, InputAdornment, Stack, TextField, Typography, useTheme } from '@mui/material'
import { IAlertData } from './AlertData'
import { IContentProps } from '../IChannel'
import { useEffect, useRef, useState } from 'react'
import { Warning, Error, Info } from '@mui/icons-material'
import { EAlertSeverity } from '@kwirthmagnify/kwirth-common'

const AlertTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    const theme = useTheme()
    const alertData:IAlertData = props.channelObject.data
    const alertBoxRef = useRef<HTMLDivElement | null>(null)
    const [alertBoxTop, setAlertBoxTop] = useState(0)
    const [filter, setFilter] = useState<string>('')
    const [filterCasing, setFilterCasing] = useState(false)
    const [filterRegex, setFilterRegex] = useState(false)
    const adornmentSelected= { margin: 0, borderWidth:1, borderStyle:'solid', borderColor:'gray', paddingLeft:3, paddingRight:3, backgroundColor:'gray', cursor: 'pointer', color:'white'}
    const adornmentNotSelected = { margin: 0, borderWidth:1, borderStyle: 'solid', borderColor:'#f0f0f0', backgroundColor:'#f0f0f0', paddingLeft:3, paddingRight:3, cursor:'pointer'}

    useEffect(() => {
        if (alertBoxRef.current) setAlertBoxTop(alertBoxRef.current.getBoundingClientRect().top)
    })

    const formatAlert = () => {
        return (<pre>{
            alertData.firedAlerts.map((alert,index) => {
                if (filter!=='') {
                    if (filterCasing) {
                        if (filterRegex) {
                            try {
                                const regex=new RegExp(filter)
                                if (!regex.test(alert.text) && !regex.test(alert.pod||'') && !regex.test(alert.container||'')) return <></>
                            }
                            catch { return <></> }
                        }
                        else {
                            if (!alert.text.includes(filter) && !alert.pod?.includes(filter) && !alert.container?.includes(filter)) return <></>
                        }
                    }
                    else {
                        if (filterRegex) {
                            try {
                                const regex=new RegExp(filter.toLocaleLowerCase())
                                if (!regex.test(alert.text.toLocaleLowerCase()) && !regex.test(alert.pod?.toLocaleLowerCase()||'') && !regex.test(alert.container?.toLocaleLowerCase()||'')) return <></>
                            }
                            catch { return <></> }
                        }
                        else {
                            if (!alert.text.toLocaleLowerCase().includes(filter.toLowerCase()) && !alert.pod?.toLocaleLowerCase().includes(filter.toLocaleLowerCase()) && !alert.container?.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) return <></>
                        }
                    }
                }

                var color = 'black'
                if (alert.severity === 'warning') color='orange'
                if (alert.severity === 'error') color='red'
                let prefix = ''
                if (props.channelObject.view==='namespace') 
                    prefix = alert.namespace+'/'
                else 
                    prefix = alert.namespace+'/'+ alert.pod +'/'
                prefix += alert.container + ' '
                if (alert.namespace === '') prefix=''
                return <span key={index}>{prefix}<span style={{color}}>{new Date(alert.timestamp).toISOString() + ' ' + alert.text}</span><br/></span>
            })
        }</pre>)
    }

    const onChangeFilter = (event: any) => {
        setFilter(event.target?.value)
    }

    return (<>
        { alertData.started && 
        <Card sx={{flex:1, width:'98%', alignSelf:'center', marginTop:'8px'}}>
            <CardHeader sx={{border:0, borderBottom:1, borderStyle:'solid', borderColor: 'divider', backgroundColor:theme.palette.grey[600]}} title={
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography marginRight={'32px'}><b>Alerts:</b> {alertData.firedAlerts.length}</Typography>
                    <Typography marginRight={'32px'}><Info fontSize='small' sx={{marginBottom:'2px', color:'blue'}} /><b>&nbsp;Info:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.INFO).length}</Typography>
                    <Typography marginRight={'32px'}><Warning fontSize='small' sx={{marginBottom:'2px', color:'orange'}} /><b>&nbsp;Warning:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.WARNING).length}</Typography>
                    <Typography marginRight={'32px'}><Error fontSize='small' sx={{marginBottom:'2px', color:'red'}}/><b>&nbsp;Error:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.ERROR).length}</Typography>
                    <Typography sx={{flexGrow:1}}></Typography>
                    <TextField value={filter} onChange={onChangeFilter} disabled={!alertData.started} size='small' variant='standard' placeholder='Filter...'
                        InputProps={{ endAdornment: 
                            <>
                                <InputAdornment position="start" onClick={() => alertData.started && setFilterRegex(!filterRegex)} style={{margin: 0}}>
                                    <Typography style={filterRegex? adornmentSelected : adornmentNotSelected}>.*</Typography>
                                </InputAdornment>
                                <InputAdornment position="start" onClick={() => alertData.started && setFilterCasing(!filterCasing)} style={{margin: 0, marginLeft:1}}>
                                    <Typography style={filterCasing? adornmentSelected : adornmentNotSelected}>Aa</Typography>
                                </InputAdornment>
                            </>
                        }}
                    />
                </Stack>}>
            </CardHeader>
            <CardContent sx={{backgroundColor:'#f0f0f0'}}>
                <Box ref={alertBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', width:'100%', flexGrow:1, height: `calc(100vh - ${alertBoxTop}px - 45px)`}}>
                    { formatAlert() }
                </Box>
            </CardContent>
        </Card>}
    </>)
}
export { AlertTabContent }