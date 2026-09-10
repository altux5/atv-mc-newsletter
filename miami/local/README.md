# Local Corporate Sign-In

## Start

```powershell
npm install
npm run dev
```

Open **http://localhost:5174** and choose **Editor Login**. The Vite development
server handles `/oauth2/sign_in`, `/oauth2/start`, `/oauth2/callback`,
`/oauth2/userinfo` and `/oauth2/sign_out` using the `openid-client` library.
No local Docker, MIAMI gateway container, or OpenShift write access is needed.

The public OIDC client is `MIAMI_ATVPRD`, matching the existing app registration.
The issuer remains `https://sso.infineon.com`; local login requests use
`openid email profile` and PKCE-S256. No client secret is required.
To use a different approved public client, set `MIAMI_CLIENT_ID` in
`.env.development.local`, then restart Vite.

The callback is generated from the actual development port, always using
`localhost`. The app registration currently includes these local callbacks:

- `http://localhost:5173/oauth2/callback`
- `http://localhost:5174/oauth2/callback`
- `http://localhost:5175/oauth2/callback`

The default port is 5174 with `strictPort` enabled: Vite will not silently move to
an unregistered port. Stop an older preview using that port before restarting, or
use `npm run dev -- --port 5173` or `npm run dev -- --port 5175`.
Do not start the Playwright suite while another server owns its test port 5175.

Use **localhost**, not `127.0.0.1`. Sign-in from a loopback IP is redirected to
localhost so that cookies and the registered callback agree. A return destination
cannot redirect outside the local application. The handler rejects non-loopback
connections and non-local Host headers.

## Sessions and Authorization

Authentication uses state, nonce and PKCE checks. Login attempts expire after ten
minutes and are single-use. A successful callback creates an opaque HttpOnly,
SameSite=Lax local cookie; access and ID tokens are not exposed to the browser.
Sessions are kept only in the Vite process, expire after one hour, and disappear
when Vite restarts. Cookies are port-specific and separate from the hosted app.
HTTP cookies are intentionally non-Secure on localhost only.

The existing `VITE_EDITOR_EMAILS` allowlist still determines which signed-in users
see editor controls. Authentication does not grant all employees editor access.
Keep that build-time list aligned with the approved editors. Local logout deletes
the local session; it does not log out of corporate SSO or the production website.

The Vite plugin is `apply: 'serve'` only, and `openid-client` is a dev dependency.
It is not part of the browser build or the Express production entry point. It
does not read, edit, or use `miami/config.yaml`, change production callback URLs,
or borrow production cookies. The old Docker Compose template remains untouched.

## Certificate Trust

The local Node process uses its default certificates plus the operating system's
trusted CA store for MIAMI discovery, token exchange and userinfo requests. Node
22.18 on this workstation supports that API. On an older Node version, upgrade
to a supported Node release or configure an approved CA bundle via
`NODE_EXTRA_CA_CERTS` **before starting Node**. Never disable TLS verification.

## Local Data Is Separate

This change fixes local sign-in and editor navigation. It does not connect the
local app to the production database. `/api` continues to proxy to your existing
local backend at port 8788 (`PROXY_PORT` overrides this). Publishing, subscriber
data and real analytics reports still need that backend and its database settings.

For a locally configured analytics backend, session verification must use the
local handler, e.g. `ANALYTICS_AUTH_USERINFO_URL=http://localhost:5174/oauth2/userinfo`,
not the hosted gateway. Keep `ANALYTICS_EDITOR_EMAILS` aligned and
`ANALYTICS_ENABLED=0` for development unless intentionally testing collection.
Do not change the hosted server's settings to these localhost values.

## Verification

```powershell
npm run test:local-auth
npm run typecheck:local-auth
```

Without a session, `/oauth2/userinfo` should return **401 JSON**, not the React
HTML page. `/oauth2/sign_in` should return **302 to sso.infineon.com**, using the
current `http://localhost:<port>/oauth2/callback` and PKCE-S256. A callback without
the matching login cookie/state must fail with 400. A successful corporate
callback should return to the local app, with editor tabs visible only for an
allowlisted email.

If an older preview still shows the React 404 page on `/oauth2/sign_in`, stop
that preview and restart it from this workspace to load the new Vite configuration.