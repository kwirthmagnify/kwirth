/*
    What an extension reads of a user's store, filtered where it has to be: the cluster list loses the entries the
    user switched off in Manage cluster list ('Enabled', stored as inUse: false). They stay in the user's list, to be
    edited, but an extension (a federation, a bot) never gets them. One filter in the core instead of one in every
    extension that reads the list.
*/
export const userStoreValueForExtensions = (group: string, key: string, value: unknown): unknown => {
    if (group !== 'clusters' || key !== 'list' || !Array.isArray(value)) return value
    return value.filter(entry => !(entry && typeof entry === 'object' && (entry as { inUse?: unknown }).inUse === false))
}
