# Censor — login extension for Kwirth

Custom login page for the **Censor** channel. A *login* extension is a small bundle (a `login.json`
config + optional background image) that Kwirth serves as the login screen; it is `targetType: "login"`
and installs from the npm tarball referenced in [`../manifest.json`](../manifest.json).

## Files

| File | Purpose |
|---|---|
| `package.json` | Metadata (`id`, `displayName`, `version`, `targetType: "login"`, `website`) + build scripts. |
| `login.json` | Login page configuration (labels, colors, layout). See below. |
| `background.png` | Full-page background image, 1200×896. |
| `build.mjs` | Copies `package.json` + `login.json` + `background.png` into `dist/` and packs `dist/censor.tgz`. |
| `watch.mjs` | Rebuild on change (dev). |

## `login.json` reference

```jsonc
{
  "startChannel": "censor",           // channel opened after login
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

## The background

Teal on near-black, following the same visual family as the other login backgrounds: a large faint
wordmark, a central motif, circuit traces and a tagline. The motif is the channel's own job — noisy log
lines, several with redacted fragments, funnelled down into a couple of clean ones.

The lower-left corner is deliberately darkened with a soft radial falloff, because that is where
`login.json` places the form (`top: 62%`, `left: 3%`). **If you move the form, re-check the contrast
there**: a lighter area under the fields makes the labels hard to read.

## Build

```bash
npm run build          # → dist/{package.json, login.json, background.png, censor.tgz}
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

- **From the catalog:** Kwirth → *Manage logins* → install **Censor** (reads `logins/manifest.json`).
- **By URL:** paste the npm tarball URL from the manifest into the custom-URL field.

The core downloads the tarball, extracts it, and (via `LoginManager`) serves any package whose
`package.json` has `targetType: "login"` as the login screen.
