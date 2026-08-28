import React from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material'

interface ITabContentTrivyAssetSbomProps { component: any; sbomReport: any }

const TrivyTabContentAssetSbom: React.FC<ITabContentTrivyAssetSbomProps> = (props) => {
    const component = props.component
    const showDependencies = () => {
        const deps = props.sbomReport.components?.dependencies?.find((d: any) => d.ref === component['bom-ref'])
        if (deps?.dependsOn) return deps.dependsOn.map((d: any) => <Typography key={d} variant='body2'>{d}</Typography>)
        return <></>
    }
    return (
        <Accordion sx={{ m: 0.1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' alignItems='center'><Typography variant='body2'>{component.name}</Typography></Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant='body2'><b>Version: </b>{component.version}</Typography>
                <Typography variant='body2'><b>Type: </b>{component.type}</Typography>
                <Typography variant='body2'><b>Provider: </b>{component.supplier?.name}</Typography>
                <Typography variant='body2'><b>Licenses: </b>{component.licenses?.map((l: any) => l.license?.id ?? l.license?.name ?? l.expression ?? '').filter(Boolean).join(', ')}</Typography>
                <Typography variant='body2'><b>Dependencies: </b>{showDependencies()}</Typography>
            </AccordionDetails>
        </Accordion>
    )
}

export { TrivyTabContentAssetSbom }
