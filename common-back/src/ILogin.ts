export type LoginFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select'

export interface ILoginFieldDef {
    name: string
    label: string
    type?: LoginFieldType
    required?: boolean
    options?: string[]
}
