import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material'

interface ITabContentTrivyAssetSbomProps {
    component: any
    sbomReport: any
    // +++ pending impl onLink: (artifact:string) => void
}

const TrivyTabContentAssetSbom: React.FC<ITabContentTrivyAssetSbomProps> = (props:ITabContentTrivyAssetSbomProps) => {
    let component = props.component

    const showDependencies = () => {
        let deps = props.sbomReport.components?.dependencies?.find((d:any) => d.ref === component['bom-ref'])
        if (deps?.dependsOn) {
            return deps.dependsOn.map((d:any) =>
                <Typography variant='body2'>{d}</Typography>
            )
        }
        else
            return <></>
    }

    return (
        <Accordion sx={{m:0.1}}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction='row' alignItems={'center'}>
                    <Typography fontSize={12}>{component.name}</Typography>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant='body2'><b>Version: </b>{component.version}</Typography>
                <Typography variant='body2'><b>Type: </b>{component.type}</Typography>
                <Typography variant='body2'><b>Provider: </b>{component.supplier?.name}</Typography>
                <Typography variant='body2'><b>Licenses: </b>{component.licenses?.map((l:any) => l.license?.id ?? l.license?.name ?? l.expression ?? '').filter(Boolean).join(', ')}</Typography>
                <Typography variant='body2'><b>Dependencies: </b>{showDependencies()}</Typography>
            </AccordionDetails>
        </Accordion>
    )
}

export { TrivyTabContentAssetSbom }