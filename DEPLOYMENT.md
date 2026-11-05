# Deployment

How to deploy the navigator in HTTP mode for a given audience: which
`MCP_AUTH_MODE` to pick, what the ingress, cBioPortal instance and identity
provider need, and how to check the result. The variable reference is in the
[README](README.md#authentication); the design rationale is in
[DESIGN.md](DESIGN.md) (decisions 15 and 16).

## Choosing a mode

`MCP_AUTH_MODE` applies to the whole process. To serve audiences that need
different modes, run one deployment per mode (same image, different
environment).

| Scenario | Mode | Callers send |
|---|---|---|
| Public cBioPortal, in-cluster client such as LibreChat | `none` | nothing |
| Public cBioPortal, Claude clients connect directly and must sign in (usage attributed to a verified user) | `oauth` | OAuth access token (handled by the client) |
| Private cBioPortal (login required), each user connects with their own portal token | `header` | `x-auth-token: <portal token>` |
| Private cBioPortal with `dat.method=oauth2`, users sign in with the portal's identity provider | `oauth` with `OAUTH_FORWARD_REFRESH_TOKEN=true` | OAuth access token (handled by the client) |
| One user on their own machine (Claude Desktop over stdio) | stdio, `CBIOPORTAL_TOKEN` | – |

The navigator never checks study permissions itself. When a caller sends a
portal token, the navigator forwards it to cBioPortal, which decides what the
caller can see (a denied study returns a 403 message, keyword search only
lists permitted studies). In `oauth` mode the only portal token is the one
from the caller's sign-in, forwarded with `OAUTH_FORWARD_REFRESH_TOKEN=true`;
without it, `oauth` mode is for portals with public data. `x-auth-token` is
not read in `oauth` mode, so portals with `dat.method=uuid` use `header`.

## Requirements for every mode

- **Reachability.** Claude.ai and Claude Desktop custom connectors connect from
  Anthropic's cloud (`160.79.104.0/21`), not from the user's machine, so the
  navigator must be reachable from the public internet over https. Claude Code
  connects from the user's machine and can use an internal address.
- **cBioPortal address.** `CBIOPORTAL_BASE_URL` is the public portal URL used
  in returned links. If the navigator can only reach the portal by an internal
  hostname, set `CBIOPORTAL_API_URL` to it; API calls and session creation go
  there.

## `none`

No credentials. Suitable only for a portal with public data. This is the
current in-cluster deployment for LibreChat
(`http://cbioportal-navigator:80/mcp`) and stays as it is.

## `header`

### cBioPortal instance

The portal must issue data access tokens: `dat.method=uuid` in its
`application.properties` (configuration only, no code change). Tested locally
with `authenticate=saml` and `dat.method=uuid`, which matches DFCI's setup
except that DFCI does not set `dat.method` yet. Portals with
`dat.method=oauth2` issue Keycloak offline tokens instead; forwarding those
works the same way (tested locally with `authenticate=saml` and
`dat.method=oauth2`).

Relevant portal settings:

| Setting | Effect on navigator users |
|---|---|
| `dat.ttl_seconds` | Token lifetime (example config: 30 days). An expired token gives a 401 message asking for a new one |
| `dat.uuid.max_number_per_user` | Default 1: downloading a new token revokes the previous one, including the one in the user's connector |

Users download their token from the portal (user menu > Data Access Token).

### Navigator

```
MCP_TRANSPORT=http
MCP_AUTH_MODE=header
CBIOPORTAL_BASE_URL=https://cbioportal.example.org
```

Requests to `/mcp` without `x-auth-token` get HTTP 401 before any tool runs,
so a misconfigured connection fails when it connects, not mid-conversation.
`CBIOPORTAL_TOKEN` is ignored in HTTP mode. The header carries a credential,
so serve the navigator over https only.

### Client setup

- **Claude.ai / Claude Desktop**: add a custom connector with
  **Authentication: No sign-in** and, under **Request headers**, the header
  `x-auth-token` with the token as value. The value may be the bare token,
  `Bearer <token>`, or the `token: <token>` line from the downloaded file.
  Request headers are a beta feature; on personal plans each user adds the
  connector to their own account.
- **Claude Code**:
  `claude mcp add --transport http navigator https://<host>/mcp --header "x-auth-token: <token>"`

## `oauth`

The navigator acts as the OAuth authorization server MCP clients talk to
(dynamic client registration, PKCE, refresh tokens, consent page) and
delegates the actual login to an upstream OpenID Connect provider (Google,
Keycloak, ...).

### Own hostname, no path prefix

The OAuth deployment needs its own hostname, e.g.
`https://navigator.example.org`, with the navigator at the root. It cannot
sit under a path prefix such as `mcp.cbioportal.org/navigator`, even with the
prefix stripped by the ingress:

- MCP clients look up OAuth metadata at root-level `/.well-known/...` paths
  derived from the MCP URL (RFC 9728, RFC 8414), not under `/navigator/`.
- The advertised `/authorize`, `/token` and `/register` endpoints are at the
  origin root.

On `mcp.cbioportal.org` those root paths already belong to the cBioPortal DB
MCP's OAuth service, so the navigator's sign-in would be routed there.
`MCP_PUBLIC_URL` with a path is rejected at startup.

`none` and `header` deployments only use `/mcp` and are fine under a prefix.

### Ingress

Route all of these to the navigator (simplest: route the whole host):

| Path | Purpose |
|---|---|
| `/mcp` | MCP endpoint (requires the access token) |
| `/.well-known/oauth-protected-resource/mcp` | Protected resource metadata |
| `/.well-known/oauth-authorization-server` | Authorization server metadata |
| `/register`, `/authorize`, `/token`, `/revoke` | OAuth endpoints |
| `/oauth/consent`, `/oauth/callback` | Consent form, upstream login redirect |

If only `/mcp` is routed, clients get the 401 that starts sign-in, but
sign-in itself then fails.

TLS must terminate at or before the ingress (`MCP_PUBLIC_URL` must be https
except for localhost). The navigator trusts exactly one proxy hop for the
client IP (`X-Forwarded-For`); `/authorize` is rate-limited per IP (100
requests per 15 minutes). If there are more hops in front of the pod (e.g. a
cloud load balancer and Traefik), all users may appear to share one IP and hit
that limit together. `/token`, `/register` and `/revoke` have no rate limit,
since Claude's hosted apps call them from one shared IP range.

### Upstream identity provider

Register the navigator as a confidential OIDC client:

- **Google** (Google Cloud console > APIs & Services > Credentials): OAuth
  client ID of type *Web application*, authorized redirect URI
  `https://<host>/oauth/callback`. `OAUTH_ISSUER=https://accounts.google.com`.
- **Keycloak**: a confidential OpenID Connect client with standard flow
  enabled and valid redirect URI `https://<host>/oauth/callback`.
  `OAUTH_ISSUER` is the realm URL, e.g.
  `https://keycloak.example.org/realms/<realm>` (the base path depends on the
  Keycloak installation; it's the `issuer` in
  `<realm URL>/.well-known/openid-configuration`).

The provider must return an ID token with `sub`; `email` and
`email_verified` are needed for the allowlist and telemetry (scopes default to
`openid email profile`).

### Secrets and configuration

```
MCP_TRANSPORT=http
MCP_AUTH_MODE=oauth
MCP_PUBLIC_URL=https://navigator.example.org
MCP_AUTH_SECRET=<from a Secret>
OAUTH_ISSUER=https://accounts.google.com
OAUTH_CLIENT_ID=<from a Secret>
OAUTH_CLIENT_SECRET=<from a Secret>
# optional
OAUTH_ALLOWED_EMAIL_DOMAINS=example.org,example.edu
OAUTH_ALLOWED_EMAILS=someone@gmail.com
CBIOPORTAL_BASE_URL=https://www.cbioportal.org
```

Generate `MCP_AUTH_SECRET` once and store it in a Kubernetes Secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

It must stay the same across restarts and be shared by all replicas: every
client registration, code and token is encrypted or signed with it, and there
is no other server-side state. With a stable secret, restarts and redeploys
(e.g. Keel on every `:latest` push) don't sign anyone out. Access tokens last
1 hour; refresh tokens last 30 days and are replaced on each use.

To rotate, move the old value to `MCP_AUTH_SECRET_PREVIOUS` and set a new
`MCP_AUTH_SECRET`; remove the previous one after 30 days (refresh token
lifetime). Changing the secret
without keeping the previous one signs everyone out.

With an allowlist set, only verified emails matching it can sign in. After
someone is removed from it and the change is deployed, their access ends
within an hour (at their next token refresh).

### Forwarding the sign-in to cBioPortal

With `OAUTH_FORWARD_REFRESH_TOKEN=true`, signing in to the navigator also
gives access to a private portal: the navigator requests `offline_access`,
keeps the refresh token the identity provider returns, and forwards it as the
caller's portal token. The portal exchanges it at the identity provider on
every request and reads the user's roles from the result, exactly as for a
data access token the user downloads. The navigator reads no claims.

Requirements:

- The portal uses `dat.method=oauth2` (for example the MSK portals).
- `OAUTH_ISSUER` is the portal's `dat.oauth2.issuer`, and
  `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` are the portal's
  `dat.oauth2.clientId`/`clientSecret`: the identity provider only lets the
  client a refresh token was issued to redeem it. Add
  `https://<host>/oauth/callback` to that client's valid redirect URIs (it
  already has the portal's `/api/data-access-token/oauth2`).
- Users can get offline tokens (Keycloak: the `offline_access` role, part of
  the realm's default roles).
- Refresh tokens are not rotated (Keycloak realm setting "Revoke Refresh
  Token" off, the default). Otherwise the portal's first exchange invalidates
  the forwarded token. Tokens users download from the portal have the same
  requirement.

A sign-in lasts as long as both the offline session (Keycloak "Offline
Session Idle", default 30 days, renewed by each portal request) and the
navigator's refresh token (30 days). When either ends, tool calls return a
401 message asking the user to reconnect. Revoking the user's offline session
or consent in the identity provider, or changing their roles, takes effect on
the next tool call.

The forwarded token is a long-lived credential and is only stored inside the
navigator's encrypted tokens, so `MCP_AUTH_SECRET` protects it.

```
OAUTH_ISSUER=https://keycloak.example.org/realms/<realm>
OAUTH_CLIENT_ID=<portal's dat.oauth2.clientId>
OAUTH_CLIENT_SECRET=<portal's dat.oauth2.clientSecret>
OAUTH_FORWARD_REFRESH_TOKEN=true
CBIOPORTAL_BASE_URL=https://cbioportal.example.org
```

### Replicas

Run one replica. Single-use authorization codes and refresh-token reuse
detection are tracked in memory per replica; with several replicas sign-in
still works, but those two protections only hold within each replica. A shared
store (Redis) can be added when more replicas are needed.

### Client setup

- **Claude.ai / Claude Desktop**: add a custom connector with the URL
  `https://<host>/mcp` and **Authentication: Sign in**. Leave the OAuth client
  fields empty: the client registers itself. Claude's hosted callback skips
  the navigator's consent page and goes straight to the provider's login.
- **Claude Code**: `claude mcp add --transport http navigator https://<host>/mcp`,
  then `/mcp` to sign in. Claude Code uses a loopback redirect, so users see
  the navigator's consent page first.

## Checking a deployment

```bash
HOST=https://navigator.example.org

curl -s $HOST/health                       # authMode as configured

# header / oauth: /mcp without credentials must be refused
curl -si -X POST $HOST/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -5
# header: 401 "Missing x-auth-token header"
# oauth:  401 with WWW-Authenticate: Bearer ... resource_metadata="$HOST/.well-known/oauth-protected-resource/mcp"

# oauth: metadata must name the public host, not an internal one or a prefix
curl -s $HOST/.well-known/oauth-protected-resource/mcp
curl -s $HOST/.well-known/oauth-authorization-server
# issuer "$HOST/", authorization_endpoint "$HOST/authorize", token_endpoint "$HOST/token"
```

Then connect a real client and call a tool. For a private portal, try a study
the test user may not access: the tool should return a 403 message.
