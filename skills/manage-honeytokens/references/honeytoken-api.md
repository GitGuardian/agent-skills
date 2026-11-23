# Honeytoken API and MCP Reference

Loaded on demand from `SKILL.md`. Everything the skill calls, in one place: the two ggmcp tools,
the Honeytoken API endpoints that fill the gaps, object fields, status model, scopes, and `curl`
recipes. Verified against `https://api.gitguardian.com/v1/openapi.json` (API 1.1.0) and the ggmcp
source (`gg_api_core/tools/list_honeytokens.py`, `generate_honey_token.py`).

## Tool selection order

1. **ggmcp tools for reads** — `list_honeytokens`, `list_sources`, `get_my_identity` (ggmcp 0.8+).
   They inherit the OAuth session, need no key in the environment, and ggmcp hides them when the
   scope is missing, which is itself a useful signal. `generate_honeytoken` is not used for
   minting: its response carries the key pair into the conversation (SKILL.md rule 1).
2. **Honeytoken API with a PAT, from a shell** for minting and everything else — create with
   tags, retrieve, update tags, notes, events, sources, reset, revoke, with-context creation. The
   PAT lives in `GITGUARDIAN_API_KEY` or in a `0600` file read with `$(cat …)`; the mint response
   is piped straight into the source API and never printed (see *Mint-and-write pipelines*).
3. **`ggshield honeytoken create` / `create-with-context`** only when neither of the above is
   available and the user already has `ggshield` authenticated with `honeytokens:write`. It mints
   and prints, nothing more; registry writes still need the API.
4. **The dashboard in the user's browser, on their yes**, when the user declines a PAT or has
   none: offer it for that one step (a reset, an events read, a Sources check), proceed only on an
   explicit yes per step (a stated session preference counts), and keep reads scoped to the
   events table and the Sources panel. Never read the token page whole: it prints the pair.
5. **Dashboard handoff** when no write path and no browser exist: give the exact page and action
   (`https://dashboard.gitguardian.com/workspace/<id>/honeytokens/<honeytoken_id>` → Reset /
   Revoke / Edit) and name the ggmcp tool that would have made the step automatic.

## ggmcp tools

| Tool | Scope | Parameters | Notes |
|---|---|---|---|
| `list_honeytokens` | `honeytokens:read` | `mine`, `status` (`active` / `triggered` / `revoked`), `search`, `ordering` (`created_at`, `-created_at`, `triggered_at`, `-triggered_at`, `revoked_at`, `-revoked_at`, `name`, `-name`), `show_token`, `creator_id`, `creator_api_token_id`, `per_page` (max 100), `cursor`, `get_all` | Returns `honeytokens[]`, `next_cursor`, `has_more`. `get_all` is byte-capped — loop on `has_more`. `mine: true` resolves the caller's member id. `show_token: true` includes the credentials and puts them in the conversation; do not use it from the MCP, read them from the API inside a shell pipeline instead. |
| `generate_honeytoken` | `honeytokens:write` | `name`, `description`, `new_token` | Not used by this skill: the response carries `token.secret_key` into the conversation, `new_token` defaults to `false` (reuses the latest active token), and it cannot take tags. If a user insists, pass `new_token: true`, `PATCH` the registry tags right after, and record the exposure in the deployment note. |

Everything else (`reset`, `revoke`, events, sources, notes, tag updates, with-context) is API-only
today.

## API basics

```bash
export GITGUARDIAN_API_URL="${GITGUARDIAN_API_URL:-https://api.gitguardian.com}"   # EU: https://api.eu1.gitguardian.com ; self-hosted: https://<instance>/exposed
H=(-H "Authorization: Token $GITGUARDIAN_API_KEY" -H "Content-Type: application/json")
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/api_tokens/self" | jq '{name, type, scopes}'   # proves the key and shows its scopes
```

`GITGUARDIAN_API_KEY` is a dashboard Personal Access Token (API → Personal access tokens). The
MCP's OAuth session and `ggshield auth login` store their own tokens and never set this variable.

Pagination is cursor-based: the `Link` header carries `rel="next"`, `X-Per-Page` the page size
(max 100). Honeytoken endpoints need Manager role when called with a Personal Access Token.

| Method and path | Scope | Purpose |
|---|---|---|
| `GET /v1/honeytokens` | `honeytokens:read` | List. Filters: `status`, `type`, `search` (name + description), `creator_id`, `revoker_id`, `creator_api_token_id`, `revoker_api_token_id`, `tags` (comma-separated), `ordering`, `show_token`, `per_page`, `cursor`. |
| `POST /v1/honeytokens` | `honeytokens:write` | Create. Body: `name`, `type: "AWS"`, `description`, `custom_tags: [{key, value}]`. Unknown tag keys are created. Pass the registry tags here so the token is never active without them. |
| `POST /v1/honeytokens/with-context` | `honeytokens:write` | Create and wrap in a realistic file. Extra body: `language`, `filename`, `project_extensions: [".py", ...]`. Returns `content`, `filepath`, `language`, `suggested_commit_message`, `honeytoken_id`, `gitguardian_url`. Use for repo placements. |
| `GET /v1/honeytokens/{id}?show_token=true` | `honeytokens:read` | Retrieve with credentials. |
| `PATCH /v1/honeytokens/{id}` | `honeytokens:write` | Update `name`, `description`, `custom_tags`. **`custom_tags` replaces the whole set** — read, merge, write. |
| `POST /v1/honeytokens/{id}/reset` | `honeytokens:write` | Triggered → active. Closes all open events. Credentials unchanged. |
| `POST /v1/honeytokens/{id}/revoke` | `honeytokens:write` | Active or triggered → revoked. Deletes the AWS key pair, closes events. **Terminal; there is no delete endpoint and no un-revoke.** Revoked tokens do not count against quota. |
| `GET /v1/honeytokens/{id}/sources` | `honeytokens:read`, `sources:read` | Every integrated source where the scanner found the token: `type` is the public source type (`github`, `gitlab`, `bitbucket`, `azure_devops`, `slack`, `jira_cloud`, `confluence_cloud`, `microsoft_teams`, `servicenow`, SharePoint / OneDrive, registries, S3 …), `name`, `url`, `source_id`, `files[]` (the elements it was found in: paths for repositories, messages / pages / tickets / files elsewhere), `total_files_count`, `open_issues_count`, `provider_metadata.archived`. Appears after the next scan of the source. The published OpenAPI spec wrongly types `type` as VCS-only (HON-1471): parse the raw JSON. |
| `GET /v1/honeytokens/{id}/notes` / `POST` / `PATCH` / `DELETE .../notes/{note_id}` | read / write | Free-text notes (`comment`, max 10 000 chars). The deployment registry lives here. **`PATCH` / `DELETE` work only on notes created by the current API key** (`api_token_id` in the note) — others return `403`. |
| `GET /v1/honeytokens/{id}/activity-logs` | `honeytokens:read` | System timeline (create, edit, deploy, trigger, reset, revoke). Filter `content_key` (for example `REVOKE`). |
| `GET /v1/honeytokens_events` | `honeytokens:read` | Workspace-wide events. Filters: `honeytoken_id`, `status` (`open` default, `archived`, `allowed`), `ip_address`, `tags`, `search`, `ordering` (`triggered_at`, `-triggered_at`). |

Not called by this skill (endpoint protection, owned by `ggshield honeytoken plant`):
`/v1/honeytokens/endpoint-deployments*` — but its vocabulary is reused: a deployment with a
placement `method` and `config`, reconcile returning `action: write | delete`, and the client
reporting `status: planted | failed | removed`. The `GG-DEPLOYMENT` note is that record for a
source instead of a machine. Not relevant here: `/v1/honeytokens/prefixes` (HMSL).

## Objects

**Honeytoken**: `id`, `name`, `description`, `type` (`AWS`), `status` (`active` / `triggered` /
`revoked`), `gitguardian_url` (the dashboard page — first column of every report; events,
`with-context` responses and `/sources` items carry their own `gitguardian_url` / `url`), `created_at`, `triggered_at` (last switch to triggered), `revoked_at`,
`open_events_count`, `creator_id`, `revoker_id`, `creator_api_token_id`, `revoker_api_token_id`,
`gitguardian_url`, `tags` (system; currently only `publicly_exposed`), `custom_tags`
(`[{id, key, value}]`, one value per key), `token` (`{access_token_id, secret_key}` when
`show_token=true`).

**Event**: `id`, `honeytoken_id`, `triggered_at`, `status` (`open` / `closed` in the object;
`open` / `archived` / `allowed` as list filter), `ip_address`, `action` (AWS API call, for example
`GetCallerIdentity`, `ListBuckets`), `data` (free-form object: user agent, country, request
details — keys vary by action, print it whole rather than assuming names), `tags`
(the dashboard's IP labels — public-monitoring IP, AWS internal IP, custom IP rules; the spec
documents only `publicly_exposed`, so print them as returned and never gate on a literal string),
`gitguardian_url`. Public exposure is reliably read from the **honeytoken's** `tags`
(`publicly_exposed`), not from event tags.

**Status model**

```
active ──(any non-allowlisted event)──> triggered ──(reset)──> active
active ──(revoke)──> revoked           triggered ──(revoke)──> revoked
```

A token with 100 open events stops recording new ones until they are closed (reset) or archived.

## Recipes

List everything that triggered, newest first, with the deployment tags:

```bash
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens?status=triggered&ordering=-triggered_at&per_page=100" \
  | jq -r '.[] | [.id, .name, .triggered_at, .open_events_count, (.custom_tags | map("\(.key)=\(.value)") | join(",")), (.tags|join(","))] | @tsv'
```

GitGuardian's own egress IPs, to tell the platform's validity check from an attacker (no auth;
check both instances, a US workspace has been rung from the EU list):

```bash
curl -sS https://api.gitguardian.com/v1/ips; curl -sS https://api.eu1.gitguardian.com/v1/ips
```

Events for one token (who tried, from where, doing what):

```bash
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens_events?honeytoken_id=$HT&status=open&ordering=-triggered_at" \
  | jq -r '.[] | [.triggered_at, .ip_address, .action, (.tags|join("|")), (.data|tostring)] | @tsv'
```

Read the deployment record of a token (newest `GG-DEPLOYMENT` note wins; see `deployment-registry.md`):

```bash
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens/$HT/notes?ordering=-created_at" \
  | jq -r '[.[] | select(.comment | startswith("GG-DEPLOYMENT"))] | first | .comment'
```

Merge-write custom tags on an existing token (never send a partial set; drop any seeded
`type=aws`, which duplicates the token's own `type` field):

```bash
cur=$(curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens/$HT" | jq '[.custom_tags[] | {key, value}]')
new=$(jq -n --argjson cur "$cur" '($cur | map(select(.key != "surface" and .key != "location" and .key != "planted-by" and .key != "rotation" and .key != "type")))
  + [{key:"surface",value:"confluence"},{key:"location",value:"OPS/runbooks/postgres-failover"},{key:"planted-by",value:"<handle>"},{key:"rotation",value:"2027-04"}]')
curl -sS "${H[@]}" -X PATCH "$GITGUARDIAN_API_URL/v1/honeytokens/$HT" -d "{\"custom_tags\": $new}"
```

Reset after a confirmed false alarm, and say why:

```bash
curl -sS "${H[@]}" -X POST "$GITGUARDIAN_API_URL/v1/honeytokens/$HT/reset"
curl -sS "${H[@]}" -X POST "$GITGUARDIAN_API_URL/v1/honeytokens/$HT/notes" \
  -d '{"comment":"RESET <YYYY-MM-DD> by <handle>: event from 10.4.2.17 (office egress) was a dev reading the runbook; IP allowlist proposed."}'
```

Revoke once the decoy is gone from every registered location:

```bash
curl -sS "${H[@]}" -X POST "$GITGUARDIAN_API_URL/v1/honeytokens/$HT/revoke"
```

Find the tokens guarding one surface. The list endpoint's `tags` filter is documented only as
"comma-separated list of tags"; whether it matches custom tags is not specified, so rely on
`search=` on the name (names embed the surface and location slug by convention) and filter
`custom_tags` client-side:

```bash
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens?search=slack-&per_page=100" \
  | jq -r '.[] | select(any(.custom_tags[]; .key=="surface" and .value=="slack")) | [.id, .name, .status] | @tsv'
```

Publicly exposed tokens only:

```bash
curl -sS "${H[@]}" "$GITGUARDIAN_API_URL/v1/honeytokens?tags=publicly_exposed&per_page=100"
```

## Mint-and-write pipelines (the pair is never printed)

Every pipeline follows the same shape: `set +x`, mint into a variable, extract the two halves
with `jq`, build the artifact, post it to the source API, then print only ids and permalinks.
`$GG` is the PAT (`$GITGUARDIAN_API_KEY` or `$(cat ~/.gg/pat)`); `$SRC` is the source token
read the same way. Nothing below echoes `$SK`.

Mint with the registry tags, keep the response out of the transcript:

```bash
set +x
HT=$(curl -sS -X POST -H "Authorization: Token $GG" -H "Content-Type: application/json" \
  --data @plan.json "$GITGUARDIAN_API_URL/v1/honeytokens")          # plan.json: name, description, type, custom_tags
ID=$(jq -r .id <<<"$HT"); AK=$(jq -r .token.access_token_id <<<"$HT"); SK=$(jq -r .token.secret_key <<<"$HT")
echo "minted $ID $AK $(jq -r .gitguardian_url <<<"$HT")"
```

Slack thread reply as the user (a user token with `chat:write`; `chat.update` / `chat.delete`
then work for rotation and removal, and no connector footer is added):

```bash
TEXT=$(printf '%s\n\n```\n[default]\naws_access_key_id = %s\naws_secret_access_key = %s\nregion = eu-west-1\n```' "$LEAD_IN" "$AK" "$SK")
jq -n --arg c "$CHANNEL" --arg t "$THREAD_TS" --arg x "$TEXT" '{channel:$c, thread_ts:$t, text:$x}' \
  | curl -sS -X POST -H "Authorization: Bearer $SRC" -H "Content-Type: application/json" --data @- https://slack.com/api/chat.postMessage \
  | jq -r '"posted ts=\(.ts) ok=\(.ok)"'
```

Confluence page body (Cloud REST v2, `PUT /pages/{id}` with the next version number), Jira comment
(`POST /rest/api/3/issue/{key}/comment`), GitHub file on a non-default branch (`PUT
/repos/{o}/{r}/contents/{path}` with `branch`) follow the same pattern: build the body with `jq
--arg` from `$AK` / `$SK`, pipe it to `curl --data @-`, print the returned id or permalink.

Handoff when no write path exists: write the filled artifact to a `0600` file on the user's
machine (`umask 077; printf … > ~/gg-plant/<name>.txt`) and tell them where it is and where to
paste it. The file, not the chat, carries the pair.

Register, then plant; revoke on failure:

```bash
curl -sS -o /dev/null -X POST -H "Authorization: Token $GG" -H "Content-Type: application/json" \
  --data "$(jq -n --arg ak "$AK" '{comment: ("GG-DEPLOYMENT\nstatus: pending\naccess_token_id: " + $ak + "\n…")}')" \
  "$GITGUARDIAN_API_URL/v1/honeytokens/$ID/notes"
# … source write … ; on failure:
curl -sS -o /dev/null -X POST -H "Authorization: Token $GG" "$GITGUARDIAN_API_URL/v1/honeytokens/$ID/revoke"
```

### Prove it without printing the pair

The user runs this from their own laptop with their own PAT; the pair goes from the API into the
AWS CLI's environment and nowhere else:

```bash
set +x; R=$(curl -sS -H "Authorization: Token $(cat ~/.gg/pat)" "$GITGUARDIAN_API_URL/v1/honeytokens/$ID?show_token=true")
AWS_ACCESS_KEY_ID=$(jq -r .token.access_token_id <<<"$R") AWS_SECRET_ACCESS_KEY=$(jq -r .token.secret_key <<<"$R") aws sts get-caller-identity
```

## Scopes and roles

| Action | Role | Scope |
|---|---|---|
| list, retrieve, events, sources, notes (read), activity logs | Manager | `honeytokens:read` (+ `sources:read` for `/sources`) |
| create, with-context, update, notes (write), reset, revoke | Manager | `honeytokens:write` |

`403` with a valid key is a missing scope or a sub-Manager seat; `401` is a bad key or wrong
instance URL. Scope recovery for `ggshield`-issued tokens is in `gitguardian-platform.md`; a PAT
is re-issued at `https://dashboard.gitguardian.com/api/personal-access-tokens` (or the instance's
equivalent).

## Known gaps worth telling the user about

- No MCP tool for reset, revoke, events, sources or notes: those need `GITGUARDIAN_API_KEY`.
- No delete endpoint: revoked tokens stay listed (filter `status=revoked`).
- `/sources` names elements, not exact locators, and does not say whether the element is still
  present (the internal API has `element_type` and `present`; HON-1471 asks to expose them). Exact
  presence is verified through the source connector.
- Deployment jobs (bulk PR-based planting across GitHub / GitLab, Business plan) have no public
  API; recommend the dashboard for a fleet of repositories and use this skill for everything else.
