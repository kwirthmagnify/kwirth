# Magnify login extension

> **Type:** Login extension<br>
> **URL slug:** `magnify`<br>
> **Start channel:** `magnify`

## What it is

The **Magnify** login extension provides a **branded login page** for the Magnify channel. It replaces the standard Kwirth login dialog with a custom-styled form and automatically opens the Magnify channel after a successful login.

Navigate to `/?loginExt=magnify` to reach it. Users can bookmark this URL as their entry point.

## Configuration

The Magnify extension uses the following `login.json` settings:

| Field | Value | Notes |
|---|---|---|
| `startChannel` | `magnify` | Opens the Magnify channel after login. |
| `top` | `62%` | Dialog positioned in the lower half of the page. |
| `left` | `3%` | Dialog pinned to the left side. |
| `width` | `300px` | Compact dialog width. |
| `textColor` | `#ffffff` | White labels and button borders. |

All other fields (`userLabel`, `passwordLabel`, etc.) use their default values. The login form supports the full **change-password** flow and all configured **IdP / SSO** providers.

## Channel access control

Because `startChannel` is set to `magnify`, only users whose `enabledChannels` includes `magnify` (or who have *all channels* enabled) can log in through this page. Users without access are rejected with an error message immediately after authentication.

---

← Back to [Login extensions](index)
