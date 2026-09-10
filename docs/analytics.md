# Built-in Analytics

The editor-only page is `/admin/analytics`. It uses the existing Express server
and PostgreSQL database. No external analytics service receives events.

## What the numbers mean

- Unique browsers: distinct pseudonymous identifiers among recorded visitors in
  the selected period. The signed first-party HttpOnly cookie lasts 30 days,
  without sliding renewal. Different devices, cookie deletion and expiry can
  count one person more than once. This is not a people or account count.
- Page views: one event per public route visit, including repeat visits. The
  collector only covers Home, the newsletter grid/list, Submit Article and
  successfully loaded newsletter bodies. Signed-in editors are excluded on every
  route, including public pages. Collection waits for the initial authentication
  check so editors do not generate an initial view before their role is known.
  Non-editors are still counted automatically. Missing newsletters and failed body loads do
  not count as newsletter views. Browser automation and blocking can affect totals.
- Newsletter views: opens of archive HTML and database-published editions.
- Active time: cumulative seconds per open while the document is visible and
  the visitor has interacted within 30 seconds. Sampling is every second,
  reporting every 15 seconds and on exit/visibility changes, capped at two hours.
- Scroll depth: the highest percentage of the newsletter body reached by the
  viewport bottom. It is not the percentage of text actually read. Short bodies
  may start at 100%. Averages include views with no engagement update as zero.
- Clicks: newsletter anchors and explicitly marked website actions (currently
  Subscribe and Submit Article). These are clicks, not successful conversions.
  `Link 1` means the first anchor in the rendered body, including internal TOC
  anchors. Editors can open the link from the report to highlight it. Changing
  an edition's link order changes that mapping; destination URLs and query
  strings are deliberately not stored.
- Subscribers: active count is current, regardless of the selected period.
  Subscription/unsubscription transitions are recorded from schema installation
  onward, including resubscriptions. No historical growth is fabricated. This
  aggregate operational history is independent of browser analytics.
- Locations: approximate network country and Americas/EMEA/APAC grouping, not
  employee office location. VPNs and egress gateways can make this inaccurate.
  Unknown is expected before local GeoIP and proxy trust are configured.

Reports use UTC calendar dates: today plus the previous 6, 29 or 89 days.
Newsletter and click rankings show the top 100 groups. Unique counts across
days, editions or countries must not be added together to obtain unique totals.
The CSV exports the displayed newsletter ranking, not raw visitor records.

## Privacy and defaults

Browser collection is **disabled by default**. When enabled on the server,
sessions and public-page events start automatically for non-editor visitors without
an allow/decline banner or stored consent choice. Once an editor is identified,
no analytics session is created, no browsing events are sent, and any existing
analytics cookie is cleared. Signing out allows automatic tracking to resume.
This excludes editor page views, clicks, active time and scroll depth; it does
not remove historical events or change operational subscriber counts.
Existing signed identifiers keep
their original expiry; they are not renewed on every page. The previous
`newsletter-analytics-consent-v1` localStorage setting is no longer consulted.
Global Privacy Control and Do Not Track still suppress sessions and events.
A detected privacy signal also clears the analytics cookie. This does not delete
previously collected records. Essential subscription processing is unaffected.

Only a keyed hash of a random browser identifier is stored with view records.
No names, emails, raw IPs, user-agent strings, referrers, arbitrary URLs, or form
values are stored by analytics. This is pseudonymous data, not a claim of full
anonymity. Existing infrastructure access logs have separate policies and may
still contain IP addresses. Keep the internal privacy notice, logs and backup
policies aligned with the approved use of this data. Removing the banner does
not make persistent browser identifiers fully anonymous or change who can access
the existing reader routes. No production MIAMI authentication paths are changed.

Views and subscription transitions older than 90 days are pruned at startup
and every six hours while the app runs; view deletion cascades to clicks.
There are no longer-term rollups in this version. Cleanup also runs when browser
collection is paused. Knative must have a running replica for scheduled cleanup
(the existing deploy script sets min-scale to 1). Database backups require their
own approved retention policy.

## Server configuration

Configure these on the existing Knative revision. Do not put secret values in
frontend `VITE_*` variables or commit them to Git.

| Variable | Purpose |
| --- | --- |
| `ANALYTICS_ENABLED` | `0` or unset initially; `1` enables automatic collection. |
| `ANALYTICS_SECRET` | At least 32 random characters, stored in an OpenShift Secret. Stable across replicas/restarts. Rotating it invalidates cookies and changes visitor hashes. |
| `PUBLIC_BASE_URL` | Exact public origin, without a path, e.g. `https://atv-mc-newsletter.eu-de-3.icp.infineon.com`. Local development must use its actual browser origin, including port. |
| `ANALYTICS_EDITOR_EMAILS` | Server-side comma-separated editor allowlist. Keep aligned with RDSP roles and `VITE_EDITOR_EMAILS`. Empty fails closed. |
| `ANALYTICS_AUTH_USERINFO_URL` | Optional override for the gateway session-verification endpoint. Defaults to `${PUBLIC_BASE_URL}/oauth2/userinfo`. Must be a trusted HTTPS endpoint in production; HTTP is only for local tests. |
| `ANALYTICS_GEOIP_PATH` | Optional mounted path to an approved MaxMind-compatible Country `.mmdb` database. Missing/invalid file yields Unknown, never a guessed country. Obtain/update it under its license; no automatic download or external lookup occurs. Restart after database updates. |
| `ANALYTICS_TRUST_PROXY` | Optional comma-separated trusted proxy IPs/CIDRs used by Express to resolve `req.ip`. Leave unset until infrastructure owners confirm the entire proxy chain and header sanitization. Never use blanket trust or guessed private-network ranges. |

The report API calls the configured userinfo endpoint with the incoming session
cookie and requires its verified `email` to be in the server allowlist. It does
not trust browser-provided email headers. The endpoint must validate the cookie
and return JSON with `email`; confirm that contract against the deployed gateway.
Internal service addresses, CA trust and connectivity may require platform setup.
Use the platform CA trust configuration, not disabled TLS verification.

## Gateway rules

Apply these alongside existing rules, with exact-path/method precedence over
public wildcards. The existing gateway configuration was not modified.

| Method / path | Access |
| --- | --- |
| `GET /api/analytics/config` | Public. Returns only the collection-enabled flag. |
| `POST /api/analytics/session` | Public, same-origin, automatic signed session; browser privacy signals respected. |
| `DELETE /api/analytics/session` | Public, same-origin, clears the identifier cookie. |
| `POST /api/analytics/events` | Public, same-origin, signed analytics cookie required. |
| `GET /api/analytics/report` | Editor role only; also verified inside Express. |
| `/admin/analytics` | Editor role only. |

Do not make `/api/analytics/**` broadly public. Forward Cookie, Origin and
privacy-signal headers unchanged. Do not cache analytics responses. Keep the
backend inaccessible through an unprotected alternate public route.

The collector uses a 4 KB JSON limit, a strict field allowlist, bounded numeric
values, parameterized SQL, UUID deduplication, and per-process rate limiting.
Repeated engagement updates retain maxima. Clicks/engagement can only attach
to a view owned by the same browser hash. Events can still be fabricated by
a client with a valid session; these are approximate analytics, not audit or billing data.
At larger scale add shared gateway limits. The current in-memory limit is
per identifier, or per socket source before session creation (shared proxies may share it).

## Rollout checklist

1. Approve the internal privacy notice, retention and use of employee analytics with the privacy
   owner. Verify database capacity, backups and application permissions to create
   the additive tables and subscription trigger in `server/schema.sql`.
2. Run the tests below and deploy with collection disabled. The schema is installed
   by the existing `ensureSchema()` startup path. No production migration was run
   during implementation.
3. Configure the server allowlist, secret, public origin and gateway routes.
   Confirm logged-out and non-editor requests cannot retrieve the report and an
   authorized editor can. Confirm these through the real gateway, not just UI hiding.
4. Verify with platform owners whether the original public client address is
   available. Do not enable proxy trust on guesswork. Mount a licensed local
   GeoIP database only after that review; otherwise keep Unknown locations.
5. Enable `ANALYTICS_ENABLED=1`. Verify that a new visitor records a public view
  without a banner, newsletter clicks/engagement appear, privacy signals block
  collection, and signed-in editors generate no events anywhere. Check a delayed
  authentication response and confirm no early editor view is recorded. Confirm
  existing public and editor routes still work and visitors resume tracking after logout.
6. Observe storage growth, database latency, report performance and cleanup logs.
   Disable collection again by setting `ANALYTICS_ENABLED=0`; existing reports remain.

Existing `deploy.ps1` explicitly replaces the container environment list. Preserve
these new settings there or manage the complete environment through your deployment
source of truth before using that script, otherwise a later deploy may remove them.
Do not execute it just to test: it commits, pushes and deploys the entire worktree.

## Local verification

```powershell
npm run test:analytics
npx tsc --noEmit -p server/tsconfig.json
npm run build
npm run test:analytics:browser -- --headed
```

The database tests run PostgreSQL in memory through PGlite; they do not connect
to OpenShift. Browser tests start Vite on port 5175, use a test-only editor email,
and intercept API responses. Their numbers are fixtures, not real readership.
They cover automatic sessions, privacy signals, editor exclusion including delayed
authentication, tracking after logout, private-route exclusion, reader events,
date selection, export, error/empty states and desktop/mobile screenshots.
Microsoft Edge is the default test browser; set `PLAYWRIGHT_CHANNEL` for another
installed supported channel. This workstation's policy blocks headless Edge,
so use `--headed`. Production SSO and real GeoIP accuracy require rollout checks.