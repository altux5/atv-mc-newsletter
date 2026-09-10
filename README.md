# atv-mc-newsletter

## Analytics

Built-in analytics is available at `/admin/analytics` for editors. Browser
collection is off by default and requires visitor opt-in when enabled.
See [Analytics setup and rollout](docs/analytics.md) for metrics, server and
gateway configuration, GeoIP prerequisites, privacy defaults and test commands.

## Authentication Modes

The app supports two frontend auth modes:

- `local`: local development fallback using username and password from env vars.
- `miami`: corporate sign-in via MIAMI OIDC endpoints.

Set these values in `.env` for a MIAMI-enabled build:

```env
VITE_AUTH_MODE=miami
VITE_EDITOR_EMAILS=editor1@infineon.com,editor2@infineon.com
VITE_OAUTH_SIGN_IN_PATH=/oauth2/sign_in
VITE_OAUTH_SIGN_OUT_PATH=/oauth2/sign_out
VITE_OAUTH_USERINFO_PATH=/oauth2/userinfo
```

`VITE_EDITOR_EMAILS` is used only for frontend editor UI gating. Real protection of editor routes still needs to be enforced by MIAMI Gateway and RDSP roles.

For local-only development without MIAMI, keep:

```env
VITE_AUTH_MODE=local
VITE_LOCAL_EDITOR_USERNAME=admin
VITE_LOCAL_EDITOR_PASSWORD=admin
```

## MIAMI Setup

Repository templates for MIAMI are provided under `miami`.

- `miami/config.example.yaml`: Helm values for MIAMI Gateway.
- `miami/local/docker-compose.yml`: local MIAMI sidecar and gateway setup.
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
VITE_AUTH_MODE=miami
VITE_EDITOR_EMAILS=editor1@infineon.com,editor2@infineon.com
VITE_OAUTH_SIGN_IN_PATH=/oauth2/sign_in
VITE_OAUTH_SIGN_OUT_PATH=/oauth2/sign_out
VITE_OAUTH_USERINFO_PATH=/oauth2/userinfo
```

For editor access, keep the frontend email allowlist aligned with the RDSP editor role membership.
