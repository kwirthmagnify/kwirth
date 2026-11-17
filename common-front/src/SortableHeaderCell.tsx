import React, { useRef } from 'react'
import { Box, SxProps, TableCell, TableSortLabel, Theme } from '@mui/material'

/*
    The header cell every table of Kwirth uses: it SORTS its table by its column (the sort is done in the
    front, by whoever owns the rows) and it can be RESIZED by dragging its right edge.

    Every table of the project has both, unless stated otherwise. The starting width is fixed —nothing moves
    with the content— and the user adjusts it by hand; the owner keeps the widths and passes them back.
    A table fills its container: give it `width: 100%` and leave ONE column without a width, which takes the
    rest.
*/

export interface ISortableHeaderCellProps {
    label: string
    // whether the table is sorted by this column now, and which way
    active: boolean
    direction: 'asc' | 'desc'
    onSort: () => void
    /*
        The column's width in px, kept by the owner, and what the drag asks it to become. Leave it undefined
        for the ONE column that takes whatever the others leave, so the table fills its container; dragging
        it gives it a width from then on.
    */
    width?: number
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
    const cellRef = useRef<HTMLTableCellElement | null>(null)
    const min = minWidth ?? DEFAULT_MIN_WIDTH

    const onMouseDown = (e: React.MouseEvent): void => {
        e.preventDefault()
        e.stopPropagation()
        // a column without a width starts the drag from the width it is drawn with
        drag.current = { x: e.clientX, width: width ?? cellRef.current?.offsetWidth ?? min }
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
        <TableCell ref={cellRef} align={align} sortDirection={active ? direction : false} data-testid={testId}
            sx={[{ ...(width !== undefined ? { width, minWidth: width, maxWidth: width } : { minWidth: min }), position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', color: disabled ? 'text.disabled' : undefined }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={onSort}>{label}</TableSortLabel>
            {/*
                The drag handle: the right edge of the header; a click on it does not sort. A thin grey line is
                ALWAYS drawn on it, so it is plain that the column can be resized; it grows and darkens under
                the pointer.
            */}
            <Box onMouseDown={onMouseDown} onClick={e => e.stopPropagation()}
                sx={{
                    position: 'absolute', top: 0, right: 0, width: 7, height: '100%', cursor: 'col-resize',
                    '&::after': { content: '""', position: 'absolute', top: '20%', bottom: '20%', right: 3, width: '1px', bgcolor: 'divider' },
                    '&:hover::after': { top: 0, bottom: 0, width: '2px', right: 2, bgcolor: 'text.secondary' }
                }} />
        </TableCell>
    )
}
