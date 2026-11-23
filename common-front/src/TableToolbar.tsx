import React from 'react'
import { Box, InputAdornment, SxProps, TextField, Theme, Typography } from '@mui/material'
import FilterList from '@mui/icons-material/FilterList'

/*
    The line above a table: what the table is, how many rows it has —and how many its filter leaves— and a
    text filter over what its cells show. It goes with SortableHeaderCell: a table of Kwirth sorts by its
    columns, can be resized, and says how many rows it has and lets them be filtered.

    The toolbar only draws: the owner keeps the filter text, filters its rows with `filterRows` and passes
    both counts. Always there, with a fixed height: an empty table says `0 rows` and nothing below it moves.
*/

export interface ITableToolbarProps {
    // what the table is, on the left; '' for none
    title: string
    // rows on screen now (after the filter) and rows in the table
    shown: number
    total: number
    filter: string
    onFilter: (filter: string) => void
    // the placeholder of the filter field
    placeholder?: string
    /*
        More about the count, right after it and in its style: `200 rows · 3,412 in all since …`. For what the
        table does not hold —a total beyond the rows kept, a limit—; the filter never changes it. (0.5.83)
    */
    detail?: string
    // anything else, between the count and the filter (a switch, a button…)
    children?: React.ReactNode
    /*
        Test ids: `<testId>-count` on the count and `<testId>-filter` on the filter's input. The filter's
        aria-label is `Filter <title>` (or `Filter` without a title).
    */
    testId?: string
    sx?: SxProps<Theme>
}

export const TABLE_TOOLBAR_HEIGHT = 40
const FILTER_WIDTH = 260

export const TableToolbar: React.FC<ITableToolbarProps> = ({ title, shown, total, filter, onFilter, placeholder, detail, children, testId, sx }) => (
    <Box sx={[{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, height: TABLE_TOOLBAR_HEIGHT, flexShrink: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
        {/* the title and the count are two sizes of text: on the same BASELINE, not centred each on its own */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flex: 1, minWidth: 0 }}>
            <Typography variant='subtitle2' noWrap sx={{ flexShrink: 0 }}>{title}</Typography>
            <Typography variant='caption' noWrap sx={{ color: 'text.secondary', minWidth: 0 }} data-testid={testId ? `${testId}-count` : undefined}>
                {detail ? `${rowCountLabel(shown, total)} · ${detail}` : rowCountLabel(shown, total)}
            </Typography>
        </Box>
        {children}
        <TextField size='small' placeholder={placeholder ?? 'Filter'} value={filter} onChange={e => onFilter(e.target.value)}
            sx={{ width: FILTER_WIDTH, flexShrink: 0, '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
            slotProps={{
                htmlInput: { 'data-testid': testId ? `${testId}-filter` : undefined, 'aria-label': title !== '' ? `Filter ${title}` : 'Filter' },
                input: { startAdornment: <InputAdornment position='start'><FilterList sx={{ fontSize: 16 }} /></InputAdornment> }
            }} />
    </Box>
)

/*
    The rows any of whose texts contains `filter`, ignoring case and the spaces around it; every row with an
    empty filter. `texts` gives what of a row is searched: what its cells SHOW (labels, not enum values), so
    the user finds what they read.
*/
export const filterRows = <T,>(rows: T[], filter: string, texts: (row: T) => Array<string | undefined>): T[] => {
    const needle = filter.trim().toLowerCase()
    if (needle === '') return rows
    return rows.filter(r => texts(r).some(t => (t ?? '').toLowerCase().includes(needle)))
}

// `12 rows`, or `3 of 12 rows` while a filter leaves some out
export const rowCountLabel = (shown: number, total: number): string => {
    const unit = total === 1 ? 'row' : 'rows'
    return shown === total ? `${total} ${unit}` : `${shown} of ${total} ${unit}`
}
