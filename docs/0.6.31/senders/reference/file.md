# file

Appends formatted lines to a file. Supports line-count-based rotation.

Config reference (`IFileSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `filePath` | `string` | — | Absolute or relative path to the log file |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag |
| `maxLines` | `number` | `0` | Rotate after this many lines (0 = no rotation) |
