# atv-mc-newsletter

## Analytics

Built-in analytics is available at `/admin/analytics` for editors. Browser
collection is off by default; when enabled on the server, public-page activity
is recorded automatically without a consent banner. Browser privacy signals
are respected. Signed-in editors are excluded across the website, and private
editor routes are never tracked. Collection waits for the initial sign-in check.
See [Analytics setup and rollout](docs/analytics.md) for metrics, server and
gateway configuration, GeoIP prerequisites, privacy defaults and test commands.

## Authentication

The frontend uses `/oauth2` endpoints in both environments. On the hosted site,
MIAMI Gateway handles them. During `npm run dev`, a Vite-only OIDC handler provides
real corporate sign-in on localhost, with no Docker requirement and no changes
to the deployed gateway. See [Local sign-in](miami/local/README.md).

Set these values in `.env` for a MIAMI-enabled build:

```env
VITE_EDITOR_EMAILS=editor1@infineon.com,editor2@infineon.com
VITE_OAUTH_SIGN_IN_PATH=/oauth2/sign_in
VITE_OAUTH_SIGN_OUT_PATH=/oauth2/sign_out
VITE_OAUTH_USERINFO_PATH=/oauth2/userinfo
```

`VITE_EDITOR_EMAILS` is used only for frontend editor UI gating. Real protection of editor routes still needs to be enforced by MIAMI Gateway and RDSP roles.

Start the local editor preview:

```powershell
npm run dev
```

Open `http://localhost:5174`. This callback is already registered for the app's
public client. Keep `localhost` consistent; `127.0.0.1` is a different hostname.
There is no password-based local auth bypass; `VITE_AUTH_MODE` and
`VITE_LOCAL_EDITOR_*` are not used by the current authentication code.

## MIAMI Setup

Repository templates for MIAMI are provided under `miami`.

- `miami/config.example.yaml`: Helm values for MIAMI Gateway.
- `miami/local/README.md`: local Node/Vite SSO setup (recommended for UI development).
- `miami/local/docker-compose.yml`: legacy full gateway container setup, not started by Vite.
- `miami/README.md`: deployment checklist and placeholders.

Before deploying, replace these placeholders:

- `authentication.clientId`: your MIAMI client ID from the service shop order.
- `rdsp.applicationId`: the RDSP application ID from the provisioning mail.
- `rdsp.instanceId`: the RDSP instance ID from the provisioning mail.
- `cookieSecret`: a random 16, 24, or 32 byte secret.
- `services.newsletter-web`: the actual Kubernetes service name and port for this app.

The template uses your current app hostname as the callback host:

```text
https://atv-mc-newsletter-play-atv-newsletter.eu-at-3.icp.infineon.com/oauth2/callback
```

Frontend env values for MIAMI:

```env
VITE_EDITOR_EMAILS=editor1@infineon.com,editor2@infineon.com
VITE_OAUTH_SIGN_IN_PATH=/oauth2/sign_in
VITE_OAUTH_SIGN_OUT_PATH=/oauth2/sign_out
VITE_OAUTH_USERINFO_PATH=/oauth2/userinfo
```

For editor access, keep the frontend email allowlist aligned with the RDSP editor role membership.
