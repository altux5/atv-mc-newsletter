# Admin Panel

The top navigation keeps Review Articles and Create Newsletter and replaces
Analytics with **Admin Panel**. Inside the panel, **Analytics** and **Subscribers**
are page-level tabs, not additional site navigation links.

## Routes

- `/admin/panel` opens Analytics by default.
- `/admin/panel/analytics` contains the existing analytics report and CSV export.
- `/admin/panel/subscribers` manages the newsletter distribution list.
- `/admin/analytics` redirects to the new Analytics location for old bookmarks.

All panel pages use the existing editor-only route guard. Switching tabs supports
keyboard arrows, Home and End, direct links, refresh, and browser history. The
editor analytics exclusion still applies throughout the panel and public pages.

## Subscriber Management

The Subscribers tab loads addresses from the existing `subscribers` table. It
defaults to active recipients; the status filter also shows unsubscribed or all
addresses. Search matches email addresses case-insensitively. Results are sorted
by email and paginated in groups of 25. The current list is loaded in one request,
which suits the present distribution-list size; use server-side pagination if
the list grows substantially.

Adding normalizes the email to lowercase and trims whitespace. An already-active
address is not duplicated. Adding an unsubscribed address reactivates it with the
same ID and original subscription date. As with the existing public subscribe
endpoint, syntactically valid email addresses are accepted; there is no new
company-domain restriction. Editors should only add authorized recipients.

Removal requires confirmation. It sets `active=false` and records the unsubscribe
date rather than deleting history. Removed addresses are excluded from subsequent
newsletter sends; it does not cancel a send already in progress. Existing one-click
unsubscribe links and the public subscription form remain unchanged. Adding or
removing addresses does not itself send an email.

Only ID, email, active state and subscription/unsubscription timestamps are
returned. Unsubscribe tokens are never exposed. Existing database triggers update
aggregate subscription counts on real status changes; duplicate adds/removals do
not inflate counts. No additional schema migration is required beyond the existing
analytics schema. Changing tabs back to Analytics reloads its report.

## Access and Deployment

The management API is separate from the existing public subscription endpoint:

| Method / path | Behavior |
| --- | --- |
| `GET /api/admin/subscribers` | List active and unsubscribed addresses. |
| `POST /api/admin/subscribers` | Add or reactivate an address; JSON `{ "email": "person@infineon.com" }`. |
| `DELETE /api/admin/subscribers/:id` | Remove an address from the active distribution list. |

Every management request verifies the corporate session through the same
server-side guard as Analytics. It reuses `ANALYTICS_EDITOR_EMAILS`,
`ANALYTICS_AUTH_USERINFO_URL` (or `${PUBLIC_BASE_URL}/oauth2/userinfo`) and the
existing TLS trust setup. An empty allowlist or unavailable session verifier
fails closed. Subscriber management works even if analytics collection is disabled.
Browser-provided email headers are not accepted as identity.

POST and DELETE additionally require an Origin matching `PUBLIC_BASE_URL` exactly.
Management JSON is limited to 2 KB. Queries are parameterized; responses are
`Cache-Control: no-store`. No new permission is granted to non-editor visitors.
This is an editor-level Admin Panel, not a separate super-admin role.

At rollout, ensure the MIAMI/RDSP editor rules cover `/admin/panel` and its child
pages, plus **all methods on `/api/admin/subscribers` and its child paths**. Keep
these protected; never add them to the public skip-auth list. Preserve the existing
public `POST /api/subscribers` and token-based unsubscribe routes. Verify logged-out
requests redirect to SSO, authenticated non-editors cannot read or change the list,
and authorized editors can load both tabs. Keep the existing secret and CA mounts.
The deployed gateway and the local `miami/config.yaml` were not changed during
this implementation.

Local UI sign-in alone does not provide subscriber data. The local Express backend
and database must also be running, with editor verification pointed to the local
OIDC userinfo endpoint. Do not connect local tests to the live distribution list.

## Checks

```powershell
npm run test:subscribers
npm run test:analytics
npx tsc --noEmit -p server/tsconfig.json
npm run build
npm run test:analytics:browser -- --headed tests/admin-panel.spec.ts
```

Set `PLAYWRIGHT_PORT` to a free port (for example 5176) if the default test port
5175 is occupied. Browser tests use fixtures; backend tests use isolated in-memory
PostgreSQL. They do not read or modify production subscribers. Coverage includes
add/remove/reactivate, duplicate handling, history, authorization and cross-site
rejection, search/pagination, empty/error states, expired sessions, keyboard tabs,
and desktop/mobile layouts.