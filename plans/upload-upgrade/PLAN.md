# Updating an extension by uploading a newer tgz — Plan

## Status (2026-11-16) — BACKLOG, not started

Raised in the QA of IRIA Incipit 0.5.x in the lab: uploading a **newer** build of an installed plugin with
**Browse** (install from a local file) is refused with `Plugin '<id>' is already installed`, and nothing in the
dialog says how to get it in. The only way today is to uninstall it and upload it again.

## Why it happens

- `POST /core/plugins/upload` → `PluginManager.installFromBuffer()` → `install(tmpTgz, registeredChannels, 'local')`,
  **without** the `upgrade` argument (`back/src/tools/PluginManager.ts`, `installFromBuffer`).
- `install()` calls `assertInstallable(...)` with `upgrade` undefined, and an id already installed is refused
  whatever its version.
- The marketplace path does update: `POST /core/plugins/install` takes `upgrade: true`, *"the EXPLICIT permission to
  overwrite an existing installation"* — what the managers' **Update** sends. The upload path has no way to give it.
- The same is likely true of the other managers' upload routes (providers, dces, senders, webhooks, docs, logins,
  idps…): to be checked one by one.

## What is wanted

Uploading a tgz of an extension that is already installed:

| The file's version | What happens |
|---|---|
| newer than the installed one | It is offered as an **update** (confirmation in the dialog), and installed with `upgrade`. |
| the same | Refused, saying it is that version already. |
| older | Refused, or offered as a downgrade with an explicit confirmation (to decide). |

The confirmation has to come from the user, as in the marketplace (it stays an explicit permission): e.g. the upload
answers 409 with the versions, and the dialog asks and sends it again with `upgrade`.

## To decide

- Downgrade: refuse, or allow it with its own confirmation.
- `requiresRestart` and the back module cache on an update by upload (see `channel-sources`: updating a plugin does
  not invalidate its back module).
- Dev plugins (`kwirth-dev.json`) and bundled ones keep refusing, as they do now.
