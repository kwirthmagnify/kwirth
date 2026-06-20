import React, { useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Slider, Stack, Typography } from '@mui/material'
import { IHomepageSetupProps } from '@kwirthmagnify/kwirth-common-front'

const MATRIX_GREEN = '#00ff41'
const MATRIX_DIM = '#006620'

const MatrixSetup: React.FC<IHomepageSetupProps> = ({ config, onSave, onClose }) => {
    const [showQuickAccess, setShowQuickAccess] = useState<boolean>(config.showQuickAccess ?? true)
    const [showRain, setShowRain] = useState<boolean>(config.showRain ?? true)
    const [rainSpeed, setRainSpeed] = useState<number>(config.rainSpeed ?? 12)
    const [rainActiveLines, setRainActiveLines] = useState<number>(config.rainActiveLines ?? 50)

    const checkSx = { color: MATRIX_DIM, '&.Mui-checked': { color: MATRIX_GREEN } }
    const labelSx = { fontFamily: 'monospace', fontSize: '0.85rem', color: MATRIX_GREEN }
    const sliderSx = { color: MATRIX_GREEN, '& .MuiSlider-thumb': { bgcolor: MATRIX_GREEN }, '& .MuiSlider-rail': { bgcolor: MATRIX_DIM } }

    return (
        <Dialog open={true} PaperProps={{ sx: { bgcolor: '#000', border: `1px solid ${MATRIX_GREEN}`, boxShadow: `0 0 20px rgba(0,255,65,0.3)`, color: MATRIX_GREEN, minWidth: 360 } }}>
            <DialogTitle sx={{ fontFamily: 'monospace', fontSize: '1rem', color: MATRIX_GREEN, borderBottom: `1px solid ${MATRIX_DIM}`, pb: 1 }}>
                {'// matrix setup'}
            </DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2.5} sx={{ pt: 2 }}>
                    <FormControlLabel
                        control={<Checkbox checked={showQuickAccess} onChange={e => setShowQuickAccess(e.target.checked)} sx={checkSx} />}
                        label={<Typography sx={labelSx}>Show tabs / workspaces card</Typography>}
                    />
                    <FormControlLabel
                        control={<Checkbox checked={showRain} onChange={e => setShowRain(e.target.checked)} sx={checkSx} />}
                        label={<Typography sx={labelSx}>Falling code</Typography>}
                    />
                    <Stack direction='column' spacing={0.5} sx={{ opacity: showRain ? 1 : 0.3, pointerEvents: showRain ? 'auto' : 'none' }}>
                        <Stack direction='row' justifyContent='space-between'>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: MATRIX_DIM }}>Speed</Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: MATRIX_GREEN }}>
                                {rainSpeed <= 5 ? 'fast' : rainSpeed <= 12 ? 'normal' : 'slow'}
                            </Typography>
                        </Stack>
                        <Slider
                            value={21 - rainSpeed}
                            min={1} max={20}
                            onChange={(_, v) => setRainSpeed(21 - (v as number))}
                            sx={sliderSx}
                        />
                        <Stack direction='row' justifyContent='space-between'>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: MATRIX_DIM }}>slow</Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: MATRIX_DIM }}>fast</Typography>
                        </Stack>
                    </Stack>
                    <Stack direction='column' spacing={0.5} sx={{ opacity: showRain ? 1 : 0.3, pointerEvents: showRain ? 'auto' : 'none' }}>
                        <Stack direction='row' justifyContent='space-between'>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: MATRIX_DIM }}>Active lines</Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: MATRIX_GREEN }}>{rainActiveLines}</Typography>
                        </Stack>
                        <Slider
                            value={rainActiveLines}
                            min={5} max={100}
                            onChange={(_, v) => setRainActiveLines(v as number)}
                            sx={sliderSx}
                        />
                        <Stack direction='row' justifyContent='space-between'>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: MATRIX_DIM }}>5</Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: MATRIX_DIM }}>100</Typography>
                        </Stack>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ borderTop: `1px solid ${MATRIX_DIM}`, pt: 1 }}>
                <Button onClick={() => onSave({ showQuickAccess, showRain, rainSpeed, rainActiveLines })} variant='contained'
                    sx={{ bgcolor: MATRIX_GREEN, color: '#000', fontFamily: 'monospace', fontWeight: 'bold', '&:hover': { bgcolor: '#00cc33' } }}>
                    Save
                </Button>
                <Button onClick={onClose} sx={{ color: MATRIX_DIM, fontFamily: 'monospace' }}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { MatrixSetup }
