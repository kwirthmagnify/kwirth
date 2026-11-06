import React from 'react'
import { TableCell, TableSortLabel } from '@mui/material'
import { ESortDirection } from '../common/StatusTypes'
import { ISortState } from './StatusSort'

/** A header cell that sorts its table by its column, with MUI's arrow. The same in every table. */
interface ISortableCellProps {
    label: string
    column: string
    sort: ISortState | undefined
    onSort: (column: string) => void
    align?: 'left' | 'right'
}

export const SortableCell: React.FC<ISortableCellProps> = ({ label, column, sort, onSort, align }) => {
    const active = sort?.column === column
    return (
        <TableCell align={align} sortDirection={active ? sort!.direction : false}>
            <TableSortLabel active={active} direction={active ? sort!.direction : ESortDirection.ASC} onClick={() => onSort(column)}>
                {label}
            </TableSortLabel>
        </TableCell>
    )
}
