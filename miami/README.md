# MIAMI Gateway Setup

1. Copy `miami/config.example.yaml` to `miami/config.yaml`.
2. Replace the placeholders for `clientId`, `cookieSecret`, `applicationId`, `instanceId`, and `services.newsletter-web`.
3. Create RDSP roles matching the route config, at minimum `newsletter-editor`.
4. Add the editor corporate emails to both RDSP and `VITE_EDITOR_EMAILS` in `.env`.
5. Install the chart with Helm:

```powershell
oc project <your-project>
helm install --values miami/config.yaml miami-gateway https://artifactory.icp.infineon.com/artifactory/helm-it-charts-local/miami-gateway-1.21.0.tgz
```

Notes:

- `host` should be the public hostname served by MIAMI Gateway.
- `clientSecret` stays empty for the public OIDC client created by the MIAMI order.
- `skipAuthRoute` keeps visitor pages public; editor paths are protected by RDSP roles.
- If your Kubernetes service name is not `newsletter-web`, update `services.newsletter-web` accordingly.
- If route precedence in your environment does not favor the editor paths before `/**`, move all editor pages under a single prefix such as `/editor/**` and update the app routes to match.
