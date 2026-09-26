import { TConfigFieldType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'

/** @deprecated use TConfigFieldType, common to every extension. */
export type LoginFieldType = TConfigFieldType

/** A login's configuration field. It is the common contract IConfigFieldDef, with nothing of its own. */
export type ILoginFieldDef = IConfigFieldDef
