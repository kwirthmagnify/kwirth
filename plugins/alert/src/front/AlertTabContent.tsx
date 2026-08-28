import React, { useEffect, useRef, useState } from 'react'
import { IAlertData, AlertData, FiredAlert } from './AlertData'
import { Box, Card, CardContent, CardHeader, InputAdornment, Stack, TextField, Typography, useTheme } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { Warning, Error, Info } from '@mui/icons-material'
import { IAlertConfig, AlertConfig } from './AlertConfig'
import { EAlertSeverity } from './AlertTypes'

const AlertTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    let alertData: IAlertData = props.channelObject.data || new AlertData()
    let alertConfig: IAlertConfig = props.channelObject.config || new AlertConfig()
    const theme = useTheme()

    const alertBoxRef = useRef<HTMLDivElement | null>(null)
    const [alertBoxTop, setAlertBoxTop] = useState(0)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const [filter, setFilter] = useState<string>('')
    const [filterCasing, setFilterCasing] = useState(false)
    const [filterRegex, setFilterRegex] = useState(false)

    const adornmentSelected = { margin: 0, borderWidth: 1, borderStyle: 'solid', borderColor: theme.palette.divider, paddingLeft: 3, paddingRight: 3, color: theme.palette.background.default, backgroundColor: theme.palette.text.primary, cursor: 'pointer' }
    const adornmentNotSelected = { margin: 0, borderWidth: 1, borderStyle: 'solid', borderColor: theme.palette.divider, backgroundColor: theme.palette.background.default, color: theme.palette.text.primary, paddingLeft: 3, paddingRight: 3, cursor: 'pointer' }

    useEffect(() => {
        if (alertBoxRef.current) setAlertBoxTop(alertBoxRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (isAtBottom && alertBoxRef.current) {
            alertBoxRef.current.scrollTo({ top: alertBoxRef.current.scrollHeight, behavior: 'auto' })
        }
    }, [isAtBottom, alertData.firedAlerts.length])

    const matchesFilter = (alert: FiredAlert): boolean => {
        if (!filter) return true
        const text = alert.text || ''
        const pod = alert.pod || ''
        const container = alert.container || ''
        if (filterCasing) {
            if (filterRegex) {
                try { const r = new RegExp(filter); return r.test(text) || r.test(pod) || r.test(container) } catch { return false }
            }
            return text.includes(filter) || pod.includes(filter) || container.includes(filter)
        } else {
            const f = filter.toLowerCase()
            if (filterRegex) {
                try { const r = new RegExp(f); return r.test(text.toLowerCase()) || r.test(pod.toLowerCase()) || r.test(container.toLowerCase()) } catch { return false }
            }
            return text.toLowerCase().includes(f) || pod.toLowerCase().includes(f) || container.toLowerCase().includes(f)
        }
    }

    const handleScroll = () => {
        if (alertBoxRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = alertBoxRef.current
            setIsAtBottom(scrollHeight - scrollTop - clientHeight < 25)
        }
    }

    const colorFor = (severity: EAlertSeverity) => {
        if (severity === EAlertSeverity.WARNING) return 'orange'
        if (severity === EAlertSeverity.ERROR) return 'red'
        return theme.palette.text.primary
    }

    return (<>
        {alertData.started &&
            <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', mt: 1, minHeight: 0 }}>
                <CardHeader title={
                    <Stack direction='row' alignItems='center'>
                        <Typography mr={4}><b>Alerts:</b> {alertData.firedAlerts.length}</Typography>
                        <Typography mr={4}><Info fontSize='small' sx={{ mb: 0.25, color: 'info.main' }} /><b>&nbsp;Info:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.INFO).length}</Typography>
                        <Typography mr={4}><Warning fontSize='small' sx={{ mb: 0.25, color: 'warning.main' }} /><b>&nbsp;Warning:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.WARNING).length}</Typography>
                        <Typography mr={4}><Error fontSize='small' sx={{ mb: 0.25, color: 'error.main' }} /><b>&nbsp;Error:</b> {alertData.firedAlerts.filter(a => a.severity === EAlertSeverity.ERROR).length}</Typography>
                        <Typography sx={{ flexGrow: 1 }} />
                        <TextField value={filter} onChange={(e: any) => setFilter(e.target?.value)} disabled={!alertData.started} size='small' variant='standard' placeholder='Filter...'
                            InputProps={{
                                endAdornment: <>
                                    <InputAdornment position='start' onClick={() => alertData.started && setFilterRegex(!filterRegex)} sx={{ m: 0 }}>
                                        <Typography sx={filterRegex ? adornmentSelected : adornmentNotSelected}>.*</Typography>
                                    </InputAdornment>
                                    <InputAdornment position='start' onClick={() => alertData.started && setFilterCasing(!filterCasing)} sx={{ m: 0, ml: 1 }}>
                                        <Typography sx={filterCasing ? adornmentSelected : adornmentNotSelected}>Aa</Typography>
                                    </InputAdornment>
                                </>
                            }}
                        />
                    </Stack>} />
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                    <Box ref={alertBoxRef} sx={{ display: 'flex', flexDirection: 'column', width: '100%', overflowY: 'auto', flexGrow: 1, height: `calc(100vh - ${alertBoxTop}px - 16px)` }} onScroll={handleScroll}>
                        <pre style={{ fontSize: '0.75rem' }}>
                            {alertData.firedAlerts.filter(matchesFilter).map((alert, index) => (
                                <div key={index} style={{ color: colorFor(alert.severity) }}>
                                    {`${alert.namespace}/${alert.pod}/${alert.container} `}
                                    <b>[{alert.severity}]</b>
                                    {` ${alert.text}`}
                                </div>
                            ))}
                        </pre>
                    </Box>
                </CardContent>
            </Card>}
    </>)
}

export { AlertTabContent }
