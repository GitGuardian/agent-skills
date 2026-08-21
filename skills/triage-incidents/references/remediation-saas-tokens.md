# Remediation: SaaS / API Tokens

> Sibling reference to [`remediation-doctrine.md`](remediation-doctrine.md), loaded on demand
> for SaaS and API-token findings. Each entry fills the schema in
> [§ 9.0](remediation-doctrine.md#90-schema). Carries § 9.2 (GitHub PAT), § 9.3 (generic API
> key), § 9.6 (Stripe), § 9.7 (Slack webhook), § 9.10 (OAuth refresh token).

### 9.2 GitHub personal access tokens

**What it is.** A token issued to a GitHub user account that grants programmatic access on the user's behalf. Two flavors:

- **Classic PAT** — broad scopes (`repo`, `workflow`, `admin:org`, …), all-or-nothing per scope, no per-repo restriction, no built-in expiration unless the user sets one. Avoid for new use.
- **Fine-grained PAT** — scoped to specific repositories, with per-permission grants (read/write per resource), mandatory expiration. The recommended form for new tokens.

**Revoke location.** GitHub → Settings (user) → Developer settings → Personal access tokens → *Tokens (classic)* or *Fine-grained tokens* → click the token → *Delete*. CLI equivalent for classic PATs via the OAuth Authorizations API (requires basic auth + 2FA OTP header):

```bash
# Replace TOKEN_ID with the authorization ID; see /authorizations endpoint
gh api -X DELETE /authorizations/<TOKEN_ID>
```

For fine-grained PATs, deletion is UI-only — no public API surface yet. The agent surfaces the UI path and stops.

**Regenerate location.** Same page → *Generate new token* (fine-grained recommended). The new token is shown once; cannot be retrieved later. If the original token was a classic PAT, the rotation is also the right moment to migrate to a fine-grained PAT with scoped repo + permission grants.

**Common consumers.**

- `~/.gitconfig` or `~/.git-credentials` via the Git credential helper (`git config --global credential.helper`)
- `~/.config/gh/hosts.yml` if installed via `gh auth login`
- Environment variables on developer machines / CI: `GH_TOKEN`, `GITHUB_TOKEN` (note `GITHUB_TOKEN` is *also* the auto-injected job-scoped token in GitHub Actions — distinguish before assuming a leak)
- GitHub Actions secrets used by workflows to call back into the API at a higher privilege than the auto-injected `GITHUB_TOKEN` allows (cross-repo dispatch, package publish, admin operations)
- Third-party CI integrations (Codecov, Sentry releases, deployment platforms) configured with a PAT instead of an installation token
- Bots and automation accounts whose PATs power org-wide tooling — these are the highest-impact rotations because consumers are often opaque

**Dependency mapping for this type.**

1. Check the token's **Last used** timestamp and accessed-repo list on the token detail page (fine-grained PATs show this directly; classic PATs show last-used date only).
2. Inventory what the token has access to:

   ```bash
   GH_TOKEN=<old-token> gh api /user/repos --paginate --jq '.[].full_name'
   GH_TOKEN=<old-token> gh api /user/orgs   --paginate --jq '.[].login'
   ```

3. Grep the org's repos for likely env-var consumers and config patterns:

   ```bash
   git grep -nE 'GH_TOKEN|GITHUB_TOKEN|github\.com/[^/]+/[^/]+\.git.*[a-zA-Z0-9_]{20,}'
   ```

4. List GitHub Actions secrets across the org (requires admin):

   ```bash
   gh api /orgs/<org>/actions/secrets --paginate --jq '.secrets[].name'
   for repo in $(gh repo list <org> --json nameWithOwner --jq '.[].nameWithOwner'); do
     gh api "/repos/$repo/actions/secrets" --jq ".secrets[].name" 2>/dev/null
   done
   ```

5. Check the audit log for actions performed by the token's owner user account, filtered to the suspected exposure window. GitHub's enterprise audit log API exposes this; smaller orgs can use the org-level audit log UI.

6. For bot / automation PATs, ask the owning team for the consumer list — there's rarely a programmatic shortcut here.

Map consumers to teams. Fine-grained PATs support multiple active tokens per user, so overlap rollout is possible: issue new token → distribute → deactivate old. Classic PATs have no overlap constraint per se, but each token's name/scope is distinct, so duplicating is straightforward.

**Post-rotation verification.**

- Confirm the old token no longer appears in the user's PAT list.
- Issue a deliberate API call with the old token and confirm `401 Bad credentials`:

  ```bash
  curl -i -H "Authorization: Bearer <old-token>" https://api.github.com/user
  # expect: HTTP/2 401 ... "message": "Bad credentials"
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch GitHub Actions runs and any external CI for `Bad credentials` failures over the next 24–48h — surfaces consumers that were missed.

Canonical GitHub reference: <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>.

### 9.3 Generic API key

**What it is.** The schema applied without service-specific hooks — the long-tail template for any vendor not given a dedicated entry below. Covers most SaaS API keys (vendor X issues `xxx_live_…` style tokens via a dashboard, you paste them into env vars). Use this entry as a thinking template when the specific vendor isn't catalogued.

**Revoke location.** The issuing vendor's API key management page. Almost always under *Settings → API keys* (Datadog, Sentry, Stripe-style vendors), *Developers → API keys* (Stripe itself, Cloudflare), or *Account → Tokens* (Snowflake, Heroku). If the vendor offers per-key labels, the label is usually how you find the leaked key in the list; if it doesn't, you may need to revoke all and reissue.

**Regenerate location.** Same page → *Create new key* / *Roll key* / *Generate token*. Some vendors (Stripe, Cloudflare) support per-key expiration and per-key scoping; prefer these on the new key. Many do not — they only offer "active key" or "revoked key" with no overlap.

**Common consumers.**

- Environment variables on the consuming service (the vendor's docs almost always tell you which env-var name they expect, e.g., `DATADOG_API_KEY`, `SENTRY_AUTH_TOKEN`).
- Secrets-manager entries that templates / config systems pull from.
- CI provider secrets, if the key is used during builds (for source map uploads, release tagging, deploy hooks).
- **Client-side bundles.** A public-facing API key (publishable / publishable-style keys) is *meant* to be exposed and is not a leak. A secret API key that landed in a frontend bundle is a real leak — distinguish by inspecting the key's prefix and the vendor's docs. When in doubt, treat as secret.
- IaC files for vendor-managed resources (Terraform providers usually accept the API key via env var or a `provider {}` block; the latter is itself a finding).

**Dependency mapping for this type.**

This is the [§ 10](remediation-doctrine.md#10-generic-coordination-framework) steps 2–3 with no vendor-specific shortcuts:

1. The vendor's dashboard may show *last-used* or *recent API requests* per key. Check first — it's the cheapest signal.
2. Grep the org's repos for the leaked key value (truncated, to avoid storing the full secret in your search tool's history) and for the vendor's canonical env-var name.
3. List runtime services that depend on the vendor — your CMDB, service catalog, or `grep -r <vendor-name>` in deploy configs.
4. Ask each likely owning team.

If the vendor supports per-key scoping, the new key should be more narrowly scoped than the old; document the scope reduction in the change ticket.

**Post-rotation verification.**

- Issue a deliberate API call with the old key against any vendor endpoint and expect 401 / 403. Most vendors return one of:
  - `HTTP 401 Unauthorized`
  - `HTTP 403 Forbidden`
  - Vendor-specific JSON with `code: "invalid_api_key"` or similar.
- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the vendor's dashboard (request volume, error rate) and the consuming services' logs for `Unauthorized` over the next 24h.

### 9.6 Stripe API keys

**What it is.** A key issued by Stripe for programmatic access to a Stripe account's API. Two key axes matter:

- **Live vs test** — `sk_live_...` vs `sk_test_...`. A leaked test key in a public repo is a finding but not a security incident; a leaked live key is.
- **Unrestricted vs restricted** — unrestricted secret keys grant full account access; restricted keys (created via Dashboard) scope permissions per resource. Treat unrestricted-secret-key leaks as worst-case Stripe.

Publishable keys (`pk_live_...`, `pk_test_...`) are *meant* to be exposed in client-side bundles; finding one in a public repo is not a leak. Verify the prefix before treating as an incident.

**Revoke location.** Stripe Dashboard → Developers → API keys → click the leaked key → *Roll key…* (rolls + sets an expiration window on the old key, supporting graceful overlap) or *Delete*. Restricted keys appear in the same list and roll the same way. There is no public CLI for revoking secret keys — Dashboard is the supported path.

**Regenerate location.** Same page. *Roll* creates a new key value with the same scopes and triggers an expiry on the old one; the default rollover window is 12 hours, configurable up to 7 days. *Create restricted key* makes a new scoped key.

**Common consumers.**

- Backend services that call Stripe's API — env var `STRIPE_SECRET_KEY` or `STRIPE_API_KEY` on payment-handling services
- Webhook signature verification — a separate `whsec_…` value lives in webhook endpoint configs and rotates independently (don't conflate; if a `whsec_` value leaked, that's a different rotation)
- CI configurations that exercise Stripe in integration tests (should be test keys, but worth verifying)
- BI / data pipelines pulling Stripe event data via their API
- Third-party platforms that aggregate Stripe accounts (BillForward, Recurly migrations, accounting integrations) — these often hold restricted keys

**Dependency mapping for this type.**

1. Stripe Dashboard → Developers → Logs filters by API key. Filter to the leaked key for the exposure window; the log shows endpoint, IP, and Stripe-version per request. This is the cleanest first signal.
2. Grep the org's repos for the canonical env-var names and the leaked key prefix:

   ```bash
   git grep -nE 'STRIPE_(SECRET|API)_KEY|sk_live_|sk_test_'
   ```

3. List services that depend on Stripe — your CMDB / service catalog should have this; otherwise search deploy configs.
4. Check CI secret stores (GitHub Actions, GitLab CI, etc.) for `STRIPE_*` entries.
5. Inventory third-party integrations from the Stripe Dashboard's *Connected apps* / *Apps* section.

Stripe's *Roll key* with an expiry window is the canonical overlap mechanism. Roll → distribute new value to consumers within the window → confirm logs show the new key in use → let the old key expire automatically.

**Post-rotation verification.**

- Once the rollover window passes, confirm the old key returns `401`:

  ```bash
  curl -i -u <old-sk_live_key>: https://api.stripe.com/v1/charges?limit=1
  # expect: HTTP/2 401 ... "error": { "type": "invalid_request_error", "code": "api_key_expired" }
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch Stripe Dashboard's API request logs for failures attributed to the old key; surfaces consumers that didn't pick up the new value before the rollover expired.

Canonical Stripe reference: <https://docs.stripe.com/keys>.

### 9.7 Slack incoming webhooks

**What it is.** A URL of the form `https://hooks.slack.com/services/T<team>/B<channel-binding>/<secret>` that lets anyone with the URL post messages into a specific Slack channel as a specific app integration. The URL *is* the credential — there is no separate username / token.

**Revoke location.** Two paths depending on how the webhook was created:

- **Created from a Slack app's Incoming Webhooks feature** — Slack app config → Features → Incoming Webhooks → find the webhook in the list → *Delete*. The owning user is whoever installed the app to the channel; they're the only one who can delete it.
- **Created from the legacy "Incoming Webhooks" custom integration** — Workspace admin → *Manage* → *Custom Integrations* → Incoming Webhooks → click → *Disable* / *Remove*. Most orgs have migrated off these, but some remain.

There is no API to revoke an individual webhook URL programmatically — UI only.

**Regenerate location.** Same UI path → *Add New Webhook* (Slack app) or *Add Incoming Webhooks Integration* (legacy). The new URL is generated immediately; cannot be retrieved later (Slack shows it once on the integration page, but copy-paste is the only path).

**Common consumers.**

- Monitoring and alerting (Prometheus Alertmanager `slack_configs`, Datadog Slack integration, PagerDuty → Slack, custom alerting scripts)
- CI failure notifications (GitHub Actions `slackapi/slack-github-action`, Jenkins Slack plugin, GitLab CI custom scripts)
- Deployment hooks (post-deploy success / failure messages from CD pipelines)
- Personal automation scripts that the developer wrote against the channel they own
- Status pages and uptime monitors (StatusCake, BetterUptime, Uptime Robot)

**Dependency mapping for this type.**

1. Grep the org's repos for the Slack webhook URL format and the leaked URL fragment:

   ```bash
   git grep -nE 'hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[a-zA-Z0-9]+'
   ```

2. Check Alertmanager / monitoring configs for Slack receivers.
3. Slack workspace owner → Manage apps → click the app that owns the webhook → see channel posts in recent activity (no per-URL request log, unfortunately, so this is coarse).
4. Check CI secret stores for `SLACK_WEBHOOK_URL` / `SLACK_WEBHOOK` entries.
5. Ask the team that owns the destination channel — they likely know what posts there.

No overlap mechanism. Both URLs work until you delete the old; coordinate consumers to switch, then delete.

**Post-rotation verification.**

- Send a deliberate POST to the old URL and expect a non-200 response:

  ```bash
  curl -i -X POST -H 'Content-Type: application/json' \
    -d '{"text":"verification probe"}' \
    https://hooks.slack.com/services/T.../B.../<old-secret>
  # expect: 404 invalid_token, or similar non-200
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the destination Slack channel for missing messages (alert silence is a *symptom*, not a great verification — pair with the explicit probe above).

Canonical Slack reference: <https://api.slack.com/messaging/webhooks>.

### 9.10 OAuth refresh tokens

**What it is.** A long-lived token issued by an OAuth 2.0 authorization server that lets a client exchange it for fresh access tokens without re-prompting the user. Refresh tokens are issued per-(user, client, scope) — leaking one compromises *that user's* grant on *that client*, not the whole application.

This worked example is the **hardest of the ten** because rotation is asymmetric: revoking the leaked token is straightforward; restoring the consumer's ability to operate requires the affected user(s) to re-authorize, which the agent cannot do on their behalf without orchestrating a new OAuth flow. Plan accordingly.

**Revoke location.** The OAuth provider's token endpoint or admin console:

- **Standard OAuth 2.0 (RFC 7009 token revocation)** — POST to the provider's revocation endpoint with the refresh token. Example for Google:

  ```bash
  curl -X POST https://oauth2.googleapis.com/revoke \
    -d "token=<leaked-refresh-token>"
  # expect: 200 OK, empty body
  ```

- **Provider admin console** — most providers expose per-user grants in the user's account settings (Google: myaccount.google.com → Security → Third-party apps with account access). Workspace / Org admins typically have a console to revoke org-wide.
- **App-side revocation** — if your app holds the refresh tokens for users (server-side OAuth client), you delete them from your token store and they become unusable on next refresh-grant attempt.

**Regenerate location.** Refresh tokens cannot be re-issued without user interaction. The user must complete the authorization flow again (consent screen → authorization code → token exchange) for your client to receive a new refresh token. The agent's job is to facilitate this — typically by surfacing a re-authorization link or an admin-impersonation flow if the provider supports it.

**Common consumers.**

- **Server-side stores** keyed by user ID — your application's database or a dedicated token store (Redis, vault) holding `(user_id, refresh_token, scopes, issued_at, expires_at)` rows
- **Mobile app keychains** (iOS Keychain, Android Keystore) — one refresh token per logged-in user, on the device
- **Browser local storage / cookies** for SPAs using OAuth — one per session; if these leaked into a public repo, every session in scope is compromised
- **Third-party integrations** where your app is the OAuth client — a CRM, billing tool, or analytics platform holding a refresh token for the user's connected account
- **Desktop apps and CLIs** storing tokens in user-config directories (`~/.config/<app>/credentials`, `~/.<app>/auth.json`)

**Dependency mapping for this type.**

This is the most asymmetric of the ten dependency maps because the affected surface is *users*, not *services*:

1. The OAuth provider's admin console typically lists active grants per user and per client. Filter to your client; the count gives you the user-impact scope.
2. Identify whether the leak was a *single user's* refresh token (one row in your token store) or a *bulk* leak (your entire token store, an export, a backup). The remediation is fundamentally different:
   - **Single token** — revoke the one, ask that user to re-authorize, done.
   - **Bulk leak** — revoke all grants for the client (provider-side bulk revocation), notify every affected user that they need to re-authorize, prepare for support volume.
3. Grep your codebase for token-storage code paths:

   ```bash
   git grep -nE 'refresh_token|refreshToken|oauth.*token'
   ```

4. List the token-storage tables / collections in your application database and inventory whether their contents were exposed.
5. For mobile / SPA leaks, the affected device count is your installed-user count for the affected version; communications must go through the app's standard channels (push notification, force-logout on next launch, mandatory re-authentication).

Owners are not other teams — they're *end users*. The coordination framework specializes here as a user-communications plan rather than a service-team rollout.

**Post-rotation verification.**

- Attempt to use the old refresh token at the provider's token endpoint and expect failure:

  ```bash
  curl -X POST https://oauth2.googleapis.com/token \
    -d "client_id=<client-id>&client_secret=<client-secret>&refresh_token=<old-token>&grant_type=refresh_token"
  # expect: 400 Bad Request, {"error": "invalid_grant"}
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch your application's auth-failure logs for users hitting re-authorization flows over the next 7–30 days; this is the natural signal that affected users are reconnecting (or churning silently if you don't have the comms in place — plan the user-facing comms before the revocation).

**Special case: token-leak detected by an audit, user not yet aware.** Revoking forces a visible re-auth prompt. Coordinate with product / support before revoking en masse so the comms reach affected users at the same time as the prompt does.
