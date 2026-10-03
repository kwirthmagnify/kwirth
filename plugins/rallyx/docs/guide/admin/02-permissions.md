# Permissions

Rally-X is an autonomous channel — it does not access cluster resources. The permissions it needs
are minimal:

| Permission | Required | Why |
|-----------|----------|-----|
| `accessString` | Yes | WebSocket authentication for score commands |
| `clusterUrl` | Yes | Connect to the Kwirth backend |
| `webSocket` | Yes | Send/receive score messages |
| `setup` | Yes | Show the setup dialog (sender selection, pause on blur) |
| `notifier` | Yes | Show in-app notifications (errors, info) |
| `clusterInfo` | No | Game does not read cluster state |
| `metrics` | No | Game does not produce metrics |

## RBAC

The plugin does not define its own RBAC rules. Access is controlled by Kwirth's standard channel
permissions — any user who can add a channel to a workspace can use Rally-X.
