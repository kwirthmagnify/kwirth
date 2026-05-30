import React from 'react'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material'

interface ITrivyTabContentAssetVulnsProps { vuln: any }

const TrivyTabContentAssetVulns: React.FC<ITrivyTabContentAssetVulnsProps> = (props) => {
    const vuln = props.vuln
    const date = new Date(vuln.publishedDate)
    const published = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate()
    let title = (vuln.title || vuln.vulnerabilityID) as string
    const i = title.indexOf(':')
    if (i >= 0) title = title.substring(0, i)
    return (
        <Accordion sx={{ m: 0.1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' alignItems='center'>
                    <Typography sx={{ width: '120px' }} variant='body2'>{vuln.severity}</Typography>
                    <Typography fontSize={12} variant='body2'>{title}</Typography>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant='body2'><b>Id: </b><a href={vuln.primaryLink} target='_blank' rel='noreferrer'>{vuln.vulnerabilityID}</a>{date.getFullYear() ? <>&nbsp;&nbsp;(published {published})</> : <></>}</Typography>
                <Typography variant='body2'><b>Resource: </b>{vuln.resource}</Typography>
                {vuln.title && <Typography variant='body2'><b>Description: </b>{vuln.title}</Typography>}
                <Typography variant='body2'><b>Installed: </b>{vuln.installedVersion}</Typography>
                <Typography variant='body2'><b>Fixed: </b>{vuln.fixedVersion || 'n/a'}</Typography>
            </AccordionDetails>
        </Accordion>
    )
}

export { TrivyTabContentAssetVulns }
