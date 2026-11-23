# @kwirthmagnify/kwirth-common-front

Frontend interfaces and shared utilities for [Kwirth](https://kwirthmagnify.dev) plugins and channels.

## What is this?

This package contains the TypeScript interfaces and React components that Kwirth plugins and channels use on the front end side. It is consumed by every extension that renders UI in Kwirth: plugins, homepages, themes, logins, and more.

## Installation

```bash
npm install @kwirthmagnify/kwirth-common-front
```

## Usage

Import the interfaces and components you need in your extension's front end code:

```typescript
import { IChannel, IPluginContext, useKwirthTheme } from '@kwirthmagnify/kwirth-common-front'
```

## Tables

Every table in Kwirth behaves the same way:
- it **sorts** by any of its columns;
- its columns can be **resized** by dragging their right edge;
- its header **stays on top** while the rows scroll;
- a line above it says **how many rows** it has and lets the user **filter** them.

Two components give you all of that. Your code still owns the rows, the sort, the widths and the filter text.

| Export | What it is |
|---|---|
| `SortableHeaderCell` | A header cell that sorts its table by its column and can be resized. Use it with `<Table stickyHeader>` so the header stays on top |
| `TableToolbar` | The line above a table: its title, `N rows` (or `N of M rows` while filtering) and a text filter |
| `filterRows(rows, filter, texts)` | The rows any of whose texts contains `filter`, ignoring case and surrounding spaces. `texts(row)` returns what the row's cells **show** |
| `rowCountLabel(shown, total)` | `12 rows`, `1 row`, `3 of 12 rows` |
| `TABLE_TOOLBAR_HEIGHT` | The toolbar's fixed height in px (40), for layouts that need it |

```tsx
import React, { useState } from 'react'
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { SortableHeaderCell, TableToolbar, filterRows } from '@kwirthmagnify/kwirth-common-front'

interface IPod { name: string, namespace: string, restarts: number }
enum EPodColumn { NAME = 'name', NAMESPACE = 'namespace', RESTARTS = 'restarts' }

const COLUMNS = [
    { id: EPodColumn.NAME, label: 'Name' },                          // no width: it takes the rest
    { id: EPodColumn.NAMESPACE, label: 'Namespace', width: 200 },
    { id: EPodColumn.RESTARTS, label: 'Restarts', width: 100, align: 'right' as const }
]

export const PodsTable: React.FC<{ pods: IPod[] }> = ({ pods }) => {
    const [filter, setFilter] = useState('')
    const [sort, setSort] = useState({ column: EPodColumn.NAME, direction: 'asc' as 'asc' | 'desc' })
    const [widths, setWidths] = useState<Partial<Record<EPodColumn, number>>>({ [EPodColumn.NAMESPACE]: 200, [EPodColumn.RESTARTS]: 100 })

    // filter on what the cells show, then sort
    const filtered = filterRows(pods, filter, p => [p.name, p.namespace, String(p.restarts)])
    const sign = sort.direction === 'asc' ? 1 : -1
    const rows = [...filtered].sort((a, b) => sign * String(a[sort.column]).localeCompare(String(b[sort.column]), undefined, { numeric: true }))
    const onSort = (column: EPodColumn) => setSort(s => ({ column, direction: s.column === column && s.direction === 'asc' ? 'desc' : 'asc' }))

    return (
        // the container needs a bounded height (flex + minHeight: 0, or a measured height) for the table to scroll
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <TableToolbar title='Pods' shown={rows.length} total={pods.length} filter={filter} onFilter={setFilter} testId='pods' />
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <Table size='small' stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHead>
                        <TableRow>
                            {COLUMNS.map(c => (
                                <SortableHeaderCell key={c.id} label={c.label} align={c.align}
                                    active={sort.column === c.id} direction={sort.direction} onSort={() => onSort(c.id)}
                                    width={widths[c.id]} onResize={w => setWidths(ws => ({ ...ws, [c.id]: w }))} />
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(p => (
                            <TableRow key={`${p.namespace}/${p.name}`} hover>
                                <TableCell>{p.name}</TableCell>
                                <TableCell>{p.namespace}</TableCell>
                                <TableCell align='right'>{p.restarts}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {/* always rendered, so nothing below moves; say WHY it is empty */}
                <Typography variant='body2' sx={{ color: 'text.secondary', p: rows.length === 0 ? 2 : 0 }}>
                    {rows.length === 0 ? (pods.length > 0 ? 'No pod matches the filter.' : 'No pods.') : ''}
                </Typography>
            </Box>
        </Box>
    )
}
```

Things to get right:

- **Filter on what the user reads.** Pass labels (`'Volume high'`, a formatted date), not enum values (`'high'`) or epoch numbers. Otherwise typing what is on screen finds nothing.
- **Count the rows before filtering as `total`** and the rows on screen as `shown`. The toolbar then says `3 of 12 rows`.
- **Say what the table does not hold with `detail`** (from 0.5.83). When a table keeps only the last N rows, pass the real total: `detail='3,412 in all since 21 Nov 12:10'` shows `200 rows · 3,412 in all since 21 Nov 12:10`. The filter does not change it.
- **Give the scroll box a bounded height.** With `flex: 1` and no bounded ancestor, the table grows with its rows, the page scrolls instead of the table, and the sticky header never sticks.
- **Two tables in one view**: give each its own toolbar and its own `flex: 1` box. They share the height, and each one scrolls on its own.
- **Test ids**: `testId='pods'` gives `pods-count` and `pods-filter`. The filter's aria-label is `Filter Pods`.
- From a plugin, `@kwirthmagnify/kwirth-common-front` is resolved at runtime from the core (`window.__kwirth__.kwirthCommonFront`). **`TableToolbar`, `filterRows` and `rowCountLabel` need a core whose front carries common-front 0.5.81 or later.** On an older core they are `undefined`.

## Long lists: `FilterableSelect`

A `Select` whose list starts with a text filter. Use it for lists too long to scroll through: the hundreds of models a provider serves, or the regions of a cloud. When the list opens, the filter has the focus. Typing narrows the options by label or value, and Enter picks the first one left.

```tsx
import { FilterableSelect } from '@kwirthmagnify/kwirth-common-front'

<FilterableSelect label='Region' value={region} onChange={setRegion} size='small' sx={{ width: 220 }}
    emptyLabel='none' options={regions.map(r => ({ value: r, label: r }))} testId='region' />
```

- **`allowCustom`**: what is typed can also be a value of its own. The list offers `Use "<text>"` whenever no option is exactly that text. Use it when the list helps but is not the whole truth. For example, an Azure deployment has whatever name its owner gave it, while Azure lists only its base models.
- **`emptyLabel`** adds a `''` option at the top, for a field that can be left empty.
- **Test ids**: `testId='region'` puts `region` on the select (click it to open), `region-filter` on the filter's input, and `region-custom` on the `Use "…"` option.
- From a plugin, it needs a core whose front carries **common-front 0.5.84** or later.

## Links

- **Kwirth**: https://kwirthmagnify.dev
- **Repository**: https://github.com/kwirthmagnify/kwirth
