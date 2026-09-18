# console

Writes colorized output to `stdout` / `stderr`.

Config reference (`IConsoleSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `prefix` | `string` | `""` | String prepended to every line |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag like `[ERROR]` |
