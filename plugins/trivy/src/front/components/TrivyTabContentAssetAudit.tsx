import React from 'react'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { Accordion, AccordionDetails, AccordionSummary, List, ListItem, Stack, Typography } from '@mui/material'

interface ITabContentTrivyAssetAuditProps { check: any }

const TrivyTabContentAssetAudit: React.FC<ITabContentTrivyAssetAuditProps> = (props) => {
    const check = props.check
    const date = new Date(check.publishedDate)
    const published = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate()
    let title = (check.title || check.checkID) as string
    const i = title.indexOf(':')
    if (i >= 0) title = title.substring(0, i)
    return (
        <Accordion sx={{ m: 0.1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' alignItems='center'>
                    <Typography sx={{ width: '120px' }}>{check.severity}</Typography>
                    <Typography fontSize={12}>{title}</Typography>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant='body2'><b>Id: </b><a href={check.primaryLink} target='_blank' rel='noreferrer'>{check.checkID}</a>{date.getFullYear() ? <>&nbsp;&nbsp;(published {published})</> : <></>}</Typography>
                <Typography variant='body2'><b>Category: </b>{check.category}</Typography>
                <Typography variant='body2'><b>Description: </b>{check.description}</Typography>
                <Typography variant='body2'><b>Remediation: </b>{check.remediation}</Typography>
                <Typography variant='body2'><b>Messages: </b></Typography>
                <List>{check.messages.map((m: string, index: number) => <ListItem key={index}><Typography variant='body2'>{m}</Typography></ListItem>)}</List>
            </AccordionDetails>
        </Accordion>
    )
}

export { TrivyTabContentAssetAudit }
