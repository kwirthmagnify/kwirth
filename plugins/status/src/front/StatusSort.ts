import { ESortDirection, EStatusTable } from '../common/StatusTypes'

/*
    Sorting by column, shared by every table of this plugin. Pure, so it can be tested.

    A click on a header sorts it ascending, a second one descending, a third one goes back to the table's
    own order — the one that puts what needs attention first. Ties keep that order too (the sort is stable).

    "Unknown" (undefined: a dash on screen) goes LAST in both directions: it is not a small value nor a big
    one, and a column of dashes on top would hide the rows that do say something.
*/

/** The column a table is sorted by, and in which direction. */
export interface ISortState {
    column: string
    direction: ESortDirection
}

/** What a tab with sortable tables receives: every table's sort, and how to change one. */
export interface ISortableProps {
    sorts: Record<string, ISortState>
    onSort: (table: EStatusTable, column: string) => void
}

/** A cell's value for sorting: a number, a text, or undefined when it is not known. */
export type TSortValue = number | string | undefined

/** The state after a click on `column`: ascending, then descending, then none (the table's own order). */
export const nextSort = (current: ISortState | undefined, column: string): ISortState | undefined => {
    if (current?.column !== column) return { column, direction: ESortDirection.ASC }
    if (current.direction === ESortDirection.ASC) return { column, direction: ESortDirection.DESC }
    return undefined
}

/*
    Texts compare as people read them: case-insensitive, and with the numbers inside compared as numbers,
    so a version 0.10.0 goes after 0.9.0 and not between 0.1.0 and 0.2.0.
*/
const compare = (a: number | string, b: number | string): number =>
    typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

/** The rows in the order asked for; without a sort, the same array as given. */
export const sortRows = <T>(rows: T[], sort: ISortState | undefined, valueOf: (row: T, column: string) => TSortValue): T[] => {
    if (!sort) return rows
    const sign = sort.direction === ESortDirection.ASC ? 1 : -1
    return [...rows].sort((x, y) => {
        const a = valueOf(x, sort.column)
        const b = valueOf(y, sort.column)
        if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
        return sign * compare(a, b)
    })
}
