import React, { useRef, useState } from 'react'
import { Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { getAvatarContent, TReportType } from '../TrivyCommon'
import { TrivyTabContentAssetAudit } from './TrivyTabContentAssetAudit'
import { TrivyTabContentAssetVulns } from './TrivyTabContentAssetVulns'
import { IAsset, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_VULN_PLURAL } from '../TrivyData'
import { TrivyTabContentAssetSbom } from './TrivyTabContentAssetSbom'
import { TrivyTabContentAssetExposed } from './TrivyTabContentAssetExposed'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'
import { ITrivyInstanceConfig } from '../../common/TrivyTypes'

interface ITrivyTabContentAssetDetailsProps {
    asset: IAsset
    trivyInstanceConfig: ITrivyInstanceConfig
    detail: TReportType
    onClose: () => void
}

const summaryVulnAuditExposed = (asset: IAsset, detail: TReportType) => {
    const report = (asset as any)[detail].report
    return (
        <TableContainer component={Paper} sx={{ mt: 1 }}>
            <Table sx={{ minWidth: '100%' }} size='small'>
                <TableHead><TableRow>
                    <TableCell align='center'><b>Critical</b></TableCell>
                    <TableCell align='center'><b>High</b></TableCell>
                    <TableCell align='center'><b>Medium</b></TableCell>
                    <TableCell align='center'><b>Low</b></TableCell>
                </TableRow></TableHead>
                <TableBody><TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell align='center'>{report.summary.criticalCount}</TableCell>
                    <TableCell align='center'>{report.summary.highCount}</TableCell>
                    <TableCell align='center'>{report.summary.mediumCount}</TableCell>
                    <TableCell align='center'>{report.summary.lowCount}</TableCell>
                </TableRow></TableBody>
            </Table>
        </TableContainer>
    )
}

const TrivyTabContentAssetDetails: React.FC<ITrivyTabContentAssetDetailsProps> = (props: ITrivyTabContentAssetDetailsProps) => {
    const [, setTick] = useState(0)
    useKeyboard(props.onClose)

    const asset = props.asset
    const report = (asset as any)[props.detail].report
    const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    const vulns: any[] = report?.vulnerabilities ? report.vulnerabilities.sort((a: any, b: any) => levels.indexOf(a.severity) - levels.indexOf(b.severity)) : []
    const checks: any[] = report?.checks ? report.checks.sort((a: any, b: any) => levels.indexOf(a.severity) - levels.indexOf(b.severity)) : []
    const secrets: any[] = report?.secrets || []
    const components: any[] = report?.components?.components || []
    const filter = useRef<HTMLInputElement>()

    const filterBySeverity = (items: any[]) => items.filter(item => {
        if (props.trivyInstanceConfig.ignoreCritical && item.severity === 'CRITICAL') return false
        if (props.trivyInstanceConfig.ignoreHigh && item.severity === 'HIGH') return false
        if (props.trivyInstanceConfig.ignoreMedium && item.severity === 'MEDIUM') return false
        if (props.trivyInstanceConfig.ignoreLow && item.severity === 'LOW') return false
        return true
    })

    return (
        <Dialog open={true} disableRestoreFocus PaperProps={{ sx: { backgroundColor: 'background.paper', borderWidth: '1px', borderStyle: 'solid', borderColor: 'divider' } }}>
            <DialogTitle>
                <Stack direction='row' spacing={2} alignItems='center'>
                    <Avatar>{getAvatarContent(report?.os?.family || 'X')}</Avatar>
                    <Stack direction='column'>
                        <Typography variant='body2'>{asset.namespace}</Typography>
                        <Typography variant='body2'>{asset.name}/{asset.container}</Typography>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ overflowY: 'hidden' }}>
                <Stack direction='column' spacing={1} mt={1}>
                    {(props.detail === TRIVY_API_VULN_PLURAL || props.detail === TRIVY_API_AUDIT_PLURAL || props.detail === TRIVY_API_EXPOSED_PLURAL) && summaryVulnAuditExposed(props.asset, props.detail)}
                    <Card sx={{ p: 1 }}>
                        {props.detail === TRIVY_API_VULN_PLURAL && <>
                            <Typography variant='body2'><b>Image:</b> {`${report.registry.server}/${report.artifact.repository}:${report.artifact.tag}`}</Typography>
                            <Typography variant='body2'><b>OS:</b> {`${report.os.family}/${report.os.name}`}</Typography>
                        </>}
                        <Typography variant='body2'><b>Scan:</b> {`${report.scanner.name} ${report.scanner.version} (${report.scanner.vendor}) on ${report.updateTimestamp}`}</Typography>
                    </Card>
                    {props.detail === TRIVY_API_SBOM_PLURAL && <TextField inputRef={filter} variant='standard' label='Filter' sx={{ mb: 2, ml: 1, mr: 1 }} onChange={() => setTick(t => t + 1)} />}
                    <Box sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: '50vh' }}>
                        {props.detail === TRIVY_API_VULN_PLURAL && (vulns.length === 0 ? <Card><CardContent>No vulnerabilities found.</CardContent></Card> : filterBySeverity(vulns).map((vuln, i) => <TrivyTabContentAssetVulns key={i} vuln={vuln} />))}
                        {props.detail === TRIVY_API_AUDIT_PLURAL && (checks.length === 0 ? <Card><CardContent>No config errors detected.</CardContent></Card> : filterBySeverity(checks).map((check, i) => <TrivyTabContentAssetAudit key={i} check={check} />))}
                        {props.detail === TRIVY_API_EXPOSED_PLURAL && (secrets.length === 0 ? <Card><CardContent>No exposed secrets detected.</CardContent></Card> : filterBySeverity(secrets).map((secret, i) => <TrivyTabContentAssetExposed key={i} secret={secret} />))}
                        {props.detail === TRIVY_API_SBOM_PLURAL && (components.length === 0 ? <Card><CardContent>No components detected.</CardContent></Card> : components.sort((a, b) => a.name.localeCompare(b.name)).filter(a => !filter.current || a.name.toLowerCase().includes(filter.current?.value)).map((component, i) => <TrivyTabContentAssetSbom key={i} component={component} sbomReport={props.asset.sbomreports.report} />))}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions><Button onClick={() => props.onClose()}>ok</Button></DialogActions>
        </Dialog>
    )
}

export { TrivyTabContentAssetDetails }
