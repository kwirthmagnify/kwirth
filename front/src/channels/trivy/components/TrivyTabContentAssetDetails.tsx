import { Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { getAvatarContent, TReportType } from '../TrivyCommon'
import { TrivyTabContentAssetAudit } from './TrivyTabContentAssetAudit'
import { TrivyTabContentAssetVulns } from './TrivyTabContentAssetVulns'
import { IAsset, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_VULN_PLURAL } from '../TrivyData'
import { TrivyTabContentAssetSbom } from './TrivyTabContentAssetSbom'
import { TrivyTabContentAssetExposed } from './TrivyTabContentAssetExposed'
import { useRef, useState } from 'react'
import { useKeyboard } from '../../../tools/useKeyboard'
import { ITrivyInstanceConfig } from '../TrivyTypes'

interface ITrivyTabContentAssetDetailsProps {
    asset: IAsset
    trivyInstanceConfig: ITrivyInstanceConfig
    detail: TReportType
    onClose: () => void
}

let summaryVulnAuditExposed = (asset:IAsset, detail:TReportType) => {
    let report = (asset as any)[detail].report

    return (
        <TableContainer component={Paper} sx={{mt:1}}>
            <Table sx={{ minWidth: '100%' }} size='small'>
                <TableHead>
                    <TableRow>
                        <TableCell align='center'><b>Critical</b></TableCell>
                        <TableCell align='center'><b>High</b></TableCell>
                        <TableCell align='center'><b>Medium</b></TableCell>
                        <TableCell align='center'><b>Low</b></TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell align='center'>{report.summary.criticalCount}</TableCell>
                        <TableCell align='center'>{report.summary.highCount}</TableCell>
                        <TableCell align='center'>{report.summary.mediumCount}</TableCell>
                        <TableCell align='center'>{report.summary.lowCount}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </TableContainer>            
    )
}

const TrivyTabContentAssetDetails: React.FC<ITrivyTabContentAssetDetailsProps> = (props:ITrivyTabContentAssetDetailsProps) => {
    const [ , setTick ] = useState(0)
    useKeyboard(props.onClose)

    let asset = props.asset
    let report = (asset as any)[props.detail].report

    let levels = ['CRITICAL','HIGH','MEDIUM','LOW']
    let vulns:any[] = report?.vulnerabilities ? report?.vulnerabilities.sort((a:any,b:any) => levels.indexOf(a.severity)-levels.indexOf(b.severity)) : []
    let checks:any[] = report?.checks ? report?.checks.sort((a:any,b:any) => levels.indexOf(a.severity)-levels.indexOf(b.severity)) : []
    let secrets:any[] = report?.secrets || []
    let components:any[] = report?.components?.components || []
    let filter = useRef<HTMLInputElement>()

    const showVulns = (trivyInstanceConfig:ITrivyInstanceConfig) => {
        if (props.detail!==TRIVY_API_VULN_PLURAL) return <></>
        if (vulns.length === 0) return <Card><CardContent>No vulnerabilities found.</CardContent></Card>
        return vulns.filter(
            vuln => {
                if (trivyInstanceConfig.ignoreCritical && vuln.severity==='CRITICAL') return undefined
                if (trivyInstanceConfig.ignoreHigh && vuln.severity==='HIGH') return undefined
                if (trivyInstanceConfig.ignoreMedium && vuln.severity==='MEDIUM') return undefined
                if (trivyInstanceConfig.ignoreLow && vuln.severity==='LOW') return undefined
                return vuln
            }
        ).map((vuln,index) => <TrivyTabContentAssetVulns key={index} vuln={vuln}/>)
    }
    
    const showAudit = (trivyInstanceConfig:ITrivyInstanceConfig) => {
        if (props.detail!==TRIVY_API_AUDIT_PLURAL) return <></>
        if (checks.length===0) return <Card><CardContent>No config errors detected.</CardContent></Card>
        return checks.filter(
            check => {
                if (trivyInstanceConfig.ignoreCritical && check.severity==='CRITICAL') return undefined
                if (trivyInstanceConfig.ignoreHigh && check.severity==='HIGH') return undefined
                if (trivyInstanceConfig.ignoreMedium && check.severity==='MEDIUM') return undefined
                if (trivyInstanceConfig.ignoreLow && check.severity==='LOW') return undefined
                return check
            }
        ).map((check,index) => <TrivyTabContentAssetAudit key={index} check={check}/>)
    }

    const showExposed = (trivyInstanceConfig:ITrivyInstanceConfig) => {
        if (props.detail!==TRIVY_API_EXPOSED_PLURAL) return <></>
        if (secrets.length===0) return <Card><CardContent>No exposed secrets detected.</CardContent></Card>
        return secrets.filter(
            secret => {
                if (trivyInstanceConfig.ignoreCritical && secret.severity==='CRITICAL') return undefined
                if (trivyInstanceConfig.ignoreHigh && secret.severity==='HIGH') return undefined
                if (trivyInstanceConfig.ignoreMedium && secret.severity==='MEDIUM') return undefined
                if (trivyInstanceConfig.ignoreLow && secret.severity==='LOW') return undefined
                return secret
            }
        ).map((secret,index) => <TrivyTabContentAssetExposed key={index} secret={secret}/>)
    }

    const showComponents = () => {
        if (props.detail!==TRIVY_API_SBOM_PLURAL) return <></>
        if (components.length===0) return <Card><CardContent>No components detected.</CardContent></Card>
        return components.sort((a,b) => a.name.localeCompare(b.name)).filter(a => !filter.current || a.name.toLowerCase().includes(filter.current?.value)).map((component,index) => <TrivyTabContentAssetSbom key={index} component={component} sbomReport={props.asset.sbomreports.report}/>)
    }

    return (
        <Dialog open={true} disableRestoreFocus PaperProps={{ sx: {backgroundColor: 'background.paper', borderWidth: '1px', borderStyle:'solid', borderColor:'divider'} }}>
            <DialogTitle>
                <Stack direction={'row'} spacing={2} alignItems={'center'}>
                    <Avatar>{getAvatarContent(report?.os?.family||'X')}</Avatar>
                    <Stack direction={'column'}>
                        <Typography variant='body2'>{asset.namespace}</Typography>
                        <Typography variant='body2'>{asset.name}/{asset.container}</Typography>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{overflowY:'hidden'}}>
                <Stack direction='column' spacing={1} mt={1}>
                    {
                        (props.detail === TRIVY_API_VULN_PLURAL || props.detail===TRIVY_API_AUDIT_PLURAL || props.detail===TRIVY_API_EXPOSED_PLURAL) && summaryVulnAuditExposed(props.asset, props.detail)
                    }                    
                    <Card sx={{p:1}}>
                        { props.detail === TRIVY_API_VULN_PLURAL && <>
                                <Typography variant='body2'><b>Image:</b> {`${report.registry.server}/${report.artifact.repository}:${report.artifact.tag}`}</Typography>
                                <Typography variant='body2'><b>OS:</b> {`${report.os.family}/${report.os.name}`}</Typography>
                        </>}
                        <Typography variant='body2'><b>Scan:</b> {`${report.scanner.name} ${report.scanner.version} (${report.scanner.vendor}) on ${report.updateTimestamp}`}</Typography>
                    </Card>
                    
                    { props.detail===TRIVY_API_SBOM_PLURAL && <TextField inputRef={filter} variant='standard' label='Filter' sx={{mb:2, ml:1, mr:1}} onChange={() => setTick((t) => t+1) }/> }

                    <Box sx={{display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', width:'100%', flexGrow:1, height:'50vh'}}>
                        { showVulns(props.trivyInstanceConfig) }
                        { showAudit(props.trivyInstanceConfig) }
                        { showExposed(props.trivyInstanceConfig) }
                        { showComponents() }
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose()}>ok</Button>
            </DialogActions>
        </Dialog>
    )
}

export { TrivyTabContentAssetDetails }