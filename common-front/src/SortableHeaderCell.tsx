import React, { useRef } from 'react'
import { Box, SxProps, TableCell, TableSortLabel, Theme } from '@mui/material'

/*
    The header cell every table of Kwirth uses: it SORTS its table by its column (the sort is done in the
    front, by whoever owns the rows) and it can be RESIZED by dragging its right edge.

    Every table of the project has both, unless stated otherwise. The starting width is fixed —nothing moves
    with the content— and the user adjusts it by hand; the owner keeps the widths and passes them back.
*/

export interface ISortableHeaderCellProps {
    label: string
    // whether the table is sorted by this column now, and which way
    active: boolean
    direction: 'asc' | 'desc'
    onSort: () => void
    // the column's width in px, kept by the owner, and what the drag asks it to become
    width: number
    onResize: (width: number) => void
    align?: 'left' | 'right'
    // greyed out (a column that does not apply right now), still sortable and resizable
    disabled?: boolean
    minWidth?: number
    sx?: SxProps<Theme>
    testId?: string
}

const DEFAULT_MIN_WIDTH = 48

export const SortableHeaderCell: React.FC<ISortableHeaderCellProps> = ({ label, active, direction, onSort, width, onResize, align, disabled, minWidth, sx, testId }) => {
    const drag = useRef<{ x: number, width: number } | undefined>(undefined)
    const min = minWidth ?? DEFAULT_MIN_WIDTH

    const onMouseDown = (e: React.MouseEvent): void => {
        e.preventDefault()
        e.stopPropagation()
        drag.current = { x: e.clientX, width }
        const move = (ev: MouseEvent): void => {
            if (drag.current) onResize(Math.max(min, drag.current.width + ev.clientX - drag.current.x))
        }
        const up = (): void => {
            drag.current = undefined
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
    }

    return (
        <TableCell align={align} sortDirection={active ? direction : false} data-testid={testId}
            sx={[{ width, minWidth: width, maxWidth: width, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', color: disabled ? 'text.disabled' : undefined }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={onSort}>{label}</TableSortLabel>
            {/* the drag handle: the right edge of the header; a click on it does not sort */}
            <Box onMouseDown={onMouseDown} onClick={e => e.stopPropagation()}
                sx={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'col-resize', '&:hover': { bgcolor: 'divider' } }} />
        </TableCell>
    )
}
