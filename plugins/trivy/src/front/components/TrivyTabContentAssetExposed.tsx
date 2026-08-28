import React from 'react'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material'

interface ITabContentTrivyAssetExposedProps { secret: any }

const TrivyTabContentAssetExposed: React.FC<ITabContentTrivyAssetExposedProps> = (props) => {
    const secret = props.secret
    return (
        <Accordion sx={{ m: 0.1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' alignItems='center'><Typography variant='body2'>{secret.title}</Typography></Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant='body2'><b>Rule ID: </b>{secret.ruleID}</Typography>
                <Typography variant='body2'><b>Severity: </b>{secret.severity}</Typography>
                <Typography variant='body2'><b>Category: </b>{secret.category}</Typography>
                <Typography variant='body2'><b>Target: </b>{secret.target}</Typography>
                <Typography variant='body2' component='div'><b>Match: </b><pre>{secret.match}</pre></Typography>
            </AccordionDetails>
        </Accordion>
    )
}

export { TrivyTabContentAssetExposed }
