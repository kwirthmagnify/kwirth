# Magnify — login extension for Kwirth

Custom login page for the **Magnify** channel. A *login* extension is a small bundle (a `login.json`
config + optional background image) that Kwirth serves as the login screen; it is `extensionType: "login"`
and installs from the npm tarball referenced in [`../manifest.json`](../manifest.json).

## Files

| File | Purpose |
|---|---|
| `package.json` | Metadata (`id`, `displayName`, `version`, `extensionType: "login"`, `website`) + build scripts. |
| `login.json` | Login page configuration (labels, colors, layout). See below. |
| `background.png` | Optional full-page background image. |
| `build.mjs` | Copies `package.json` + `login.json` + `background.png` into `dist/` and packs `dist/<id>.tgz`. |
| `watch.mjs` | Rebuild on change (dev). |

## `login.json` reference

```jsonc
{
  "startChannel": "magnify",          // channel opened after login
  "userLabel": "User",                // field labels
  "passwordLabel": "Password",
  "newPasswordLabel": "New password",
  "repeatPasswordLabel": "Repeat new password",
  "changePasswordMessage": "Login successful. You can now set a new password.",
  "changePasswordButton": "Change password",
  "okButton": "Login",
  "textColor": "#ffffff",             // text color over the background
  "top": "62%",                       // form position/size (CSS units)
  "left": "3%",
  "width": "300px"
}
```

## Build

```bash
npm run build          # → dist/{package.json, login.json, background.png, magnify.tgz}
```

`build.mjs` reads the version from this `package.json`, so bump the version here and the built
`dist/package.json` stays in sync.

## Publish (bbpm)

```bash
npm version patch --no-git-tag-version   # bump
npm run build                            # regenerate dist/ at the new version
cd dist && npm publish --access public   # publish the npm package (tarball = the login bundle)
```

Then update the entry in [`../manifest.json`](../manifest.json) (`version` + `url`) so the catalog in
Kwirth's **Manage logins** dialog offers the new version.

## Install

- **From the catalog:** Kwirth → *Manage logins* → install **Magnify** (reads `logins/manifest.json`).
- **By URL:** paste the npm tarball URL from the manifest into the custom-URL field.

The core downloads the tarball, extracts it, and (via `LoginManager`) serves any package whose
`package.json` has `extensionType: "login"` as the login screen.
