# Developing your own daemon

1. Create a new package under `daemons/<your-daemon>/`.
2. Add `@kwirthmagnify/kwirth-common-back` as a dependency.
3. Implement the `IDaemon` interface and export the class as the default export.
4. Build to a single CJS bundle as `dist/back.js` (with `dist/package.json` containing `id`, `name`, `version`, `description`).

Minimal scaffold:

```typescript
import { IDaemon, IBackDaemonObject, IDaemonInstanceConfig, BackDaemonData } from '@kwirthmagnify/kwirth-common-back'

export class MyDaemon implements IDaemon {
    readonly daemonId = 'my-daemon'

    constructor(private clusterInfo: unknown, private bdo: IBackDaemonObject) {}

    getDaemonData(): BackDaemonData {
        return { id: 'my-daemon' }
    }

    async startDaemon(): Promise<void> {
        this.bdo.logInfo?.('[my-daemon] started')
    }

    containsInstance(id: string): boolean { return false }
    containsAsset(id: string, ns: string, pod: string, c: string): boolean { return false }

    async addObject(cfg: IDaemonInstanceConfig, ns: string, pod: string, c: string): Promise<boolean> {
        return true
    }

    async deleteObject(cfg: IDaemonInstanceConfig, ns: string, pod: string, c: string): Promise<boolean> {
        return true
    }

    async processCommand(instanceId: string, command: string, data?: unknown): Promise<unknown> {
        return null
    }
}

export default MyDaemon
```

## Hot-reload for development

Add the daemon to `kwirth-dev.json`:

```json
{
  "daemons": {
    "my-daemon": "../daemons/my-daemon/dist"
  }
}
```

Kwirth watches `dist/back.js` and hot-reloads the daemon whenever the file changes.
