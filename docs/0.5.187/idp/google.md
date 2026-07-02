# Google / Gmail

This page explains how to let users sign in to Kwirth with their **Google** account (Gmail or Google Workspace).

Signing in with Google requires two things: registering Kwirth as an application in Google (so Google trusts the sign-in redirects), and telling Kwirth about that application through environment variables. Then you create the users in Kwirth as usual.

> You do **not** create user accounts in Google. Users sign in with their own Google accounts. What you register in Google is *your application* (an OAuth client).

## Step 1 — Register Kwirth in Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create (or select) a project. It is free.
2. Open **APIs & Services → OAuth consent screen**:
   - **User type: External** — required so that `@gmail.com` accounts can sign in. Use *Internal* only if every user belongs to your own Google Workspace organization.
   - Fill in the application name and support email.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type: Web application**.
   - **Authorized redirect URIs**: add your Kwirth callback URL:
     - `https://<your-kwirth-host>/core/auth/google/callback`
     - For local development: `http://localhost:3883/core/auth/google/callback`
     - If Kwirth is served under a sub-path (`ROOTPATH`), include it: `https://<host>/<rootpath>/core/auth/google/callback`
   - On save, Google gives you a **Client ID** and a **Client Secret**. Keep them for Step 2.
4. **Scopes**: Kwirth only needs `openid`, `email` and `profile`. These are *non-sensitive* scopes, so Google does **not** require any app verification/review.

### Testing vs Production

- In **Testing** mode, only the accounts you add as *test users* (up to 100) can sign in. This is ideal for a pilot.
- In **Production** mode, any Google account can authenticate. Since only non-sensitive scopes are used, no Google verification process is needed.

> Even in Production, being able to *authenticate* with Google does not mean being able to *enter* Kwirth — see [access control](#access-control) below.

## Step 2 — Configure Kwirth

Add the following environment variables to your Kwirth deployment:

```
AUTH=kwirth,google
AUTH_GOOGLE_LABEL=Login with Google
AUTH_GOOGLE_ISSUER=https://accounts.google.com
AUTH_GOOGLE_CLIENTID=xxxxxxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-client-secret
AUTH_GOOGLE_SCOPES=openid email profile
FRONTURL=https://<your-kwirth-host>
```

- `AUTH` must include `google` (keep `kwirth` too, so the built-in admin login stays available).
- `AUTH_GOOGLE_CLIENTID` / `AUTH_GOOGLE_SECRET` are the values from Step 1.
- `AUTH_GOOGLE_LABEL` is the text shown on the login button.
- `FRONTURL` is used to redirect the user back to the Kwirth web app after sign-in.

After restarting Kwirth, a **"Login with Google"** button appears on the login screen.

## Step 3 — Create the users in Kwirth

Google only proves identity; the user must exist in Kwirth. From [User management](/0.5.187/usermanagement) (visible to admins only):

1. Click **New**.
2. Set the **Id** to the user's **email address** (this is how Kwirth matches the Google identity).
3. Select **Google** as the user's IdP. When an IdP is selected, a password is **not** required.
4. Add the **resources** (scopes, namespaces, ...) that define what the user can access, exactly like any other user.
5. **Save**.

## Access control

For a Google user to actually log in, all of the following must hold:

1. Google reports the email as **verified**.
2. A Kwirth user exists with that **email as its id**.
3. That user is **bound to Google** as its IdP.

So the whole universe of Google accounts can *authenticate*, but only the users you explicitly created (bound to Google) can *enter* Kwirth. A verified email arriving from a different provider than the one assigned to the user is rejected.

See [IdP integration](/0.5.187/idp/index) for the general concepts.
