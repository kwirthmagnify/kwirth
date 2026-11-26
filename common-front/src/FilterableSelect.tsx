import React, { useState } from 'react'
import { FormControl, InputAdornment, InputLabel, ListSubheader, MenuItem, Select, SxProps, TextField, Theme } from '@mui/material'
import FilterList from '@mui/icons-material/FilterList'

/*
    A Select whose list starts with a text filter. For the lists too long to scroll through —the hundreds of
    models a provider serves, the regions of a cloud—: the list opens with the filter focused, what is typed
    narrows the options, and Enter picks the first one left.

    With `allowCustom`, what is typed can also be a value of its own: the list offers `Use "<text>"` when no
    option is exactly that. For the fields whose list is a help and not the whole truth — an Azure deployment
    is called whatever its owner chose, and the provider only lists its base models.
*/

export interface IFilterableSelectOption {
    value: string
    label: string
    disabled?: boolean
}

export interface IFilterableSelectProps {
    label: string
    value: string
    options: IFilterableSelectOption[]
    onChange: (value: string) => void
    disabled?: boolean
    size?: 'small' | 'medium'
    variant?: 'standard' | 'outlined'
    // a '' option at the top (e.g. 'none'), when the field can be left empty
    emptyLabel?: string
    // offers what was typed in the filter as a value of its own
    allowCustom?: boolean
    fullWidth?: boolean
    sx?: SxProps<Theme>
    /*
        Test ids: `<testId>` on the select itself (what is clicked to open it), `<testId>-filter` on the filter's
        input and `<testId>-custom` on the `Use "…"` option.
    */
    testId?: string
}

// What the list shows for a filter: the options whose label or value contains it (any case, trimmed) and,
// with allowCustom, the typed text when no option is exactly that.
export const filterSelectOptions = (options: IFilterableSelectOption[], filter: string, allowCustom: boolean): { options: IFilterableSelectOption[], custom?: string } => {
    const typed = filter.trim()
    const needle = typed.toLowerCase()
    /* 🔴 A value shown ONCE (0.5.85): a value is the item's key, and two items with the same key are two the list
       cannot tell apart — filtering left the copies painted (Azure's model list carries 15 ids twice). The first wins. */
    const seen = new Set<string>()
    const unique = options.filter(o => !seen.has(o.value) && Boolean(seen.add(o.value)))
    const shown = needle === '' ? unique : unique.filter(o => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    const custom = allowCustom && typed !== '' && !options.some(o => o.value === typed) ? typed : undefined
    return { options: shown, custom }
}

export const FilterableSelect: React.FC<IFilterableSelectProps> = (props: IFilterableSelectProps) => {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const { options, custom } = filterSelectOptions(props.options, filter, props.allowCustom === true)
    const labelOf = (value: string): string => value === '' ? (props.emptyLabel ?? '') : (props.options.find(o => o.value === value)?.label ?? value)

    const close = (): void => {
        setOpen(false)
        setFilter('')
    }
    const pick = (value: string): void => {
        props.onChange(value)
        close()
    }
    // the first option left: the typed value comes first when it is offered, as it is in the list
    const first = (): string | undefined => custom ?? options.find(o => !o.disabled)?.value

    // the current value stays among the items even when the filter hides it: without it, the Select has nothing to show
    const valueHidden = props.value !== '' && !options.some(o => o.value === props.value) && custom !== props.value
    const variant = props.variant ?? 'outlined'

    return (
        <FormControl size={props.size} variant={variant} fullWidth={props.fullWidth} disabled={props.disabled} sx={props.sx}>
            <InputLabel shrink={props.emptyLabel !== undefined || props.value !== '' ? true : undefined}>{props.label}</InputLabel>
            <Select value={props.value} label={variant === 'outlined' ? props.label : undefined}
                open={open} onOpen={() => setOpen(true)} onClose={close}
                onChange={e => pick(e.target.value as string)}
                displayEmpty={props.emptyLabel !== undefined}
                renderValue={v => props.emptyLabel !== undefined && v === '' ? <em>{props.emptyLabel}</em> : labelOf(v as string)}
                data-testid={props.testId}
                MenuProps={{ autoFocus: false, slotProps: { paper: { sx: { maxHeight: 420 } } } }}>
                {/* the filter is the list's header: it is not an option, and the keys typed in it are not the Select's
                    type-ahead. Escape still closes the list. */}
                <ListSubheader sx={{ pt: 1, pb: 1, lineHeight: 'normal' }}>
                    <TextField size='small' autoFocus fullWidth placeholder='Filter' value={filter}
                        onChange={e => setFilter(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Escape') return
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                const v = first()
                                if (v !== undefined) pick(v)
                            }
                        }}
                        slotProps={{
                            htmlInput: { 'data-testid': props.testId ? `${props.testId}-filter` : undefined, 'aria-label': `Filter ${props.label}` },
                            input: { startAdornment: <InputAdornment position='start'><FilterList sx={{ fontSize: 16 }} /></InputAdornment> }
                        }} />
                </ListSubheader>
                {custom !== undefined
                    ? <MenuItem value={custom} data-testid={props.testId ? `${props.testId}-custom` : undefined}>Use &quot;{custom}&quot;</MenuItem>
                    : undefined}
                {props.emptyLabel !== undefined ? <MenuItem value=''><em>{props.emptyLabel}</em></MenuItem> : undefined}
                {options.map(o => <MenuItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</MenuItem>)}
                {valueHidden ? <MenuItem value={props.value} sx={{ display: 'none' }}>{labelOf(props.value)}</MenuItem> : undefined}
                {options.length === 0 && custom === undefined
                    ? <MenuItem disabled value='__no_matches__'><em>No matches</em></MenuItem>
                    : undefined}
            </Select>
        </FormControl>
    )
}
