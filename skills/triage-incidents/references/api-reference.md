# GitGuardian incidents API — curl reference

This file documents every endpoint the `triage-incidents` skill uses. Read [`lifecycle.md`](lifecycle.md) first for the state model — this file is the call-level reference, not the conceptual map.

## Base URL and auth

All requests target the workspace's API host (default `https://api.gitguardian.com`, override with `GITGUARDIAN_INSTANCE_URL` for self-hosted or EU). All requests carry a single header:

```
Authorization: Token $GITGUARDIAN_API_KEY
```

The skill assumes `GITGUARDIAN_API_KEY` is set in the environment and the token has scopes `incidents:read`, `incidents:write`, and `members:read`. If the env var isn't set, do **not** prompt for it inline in a curl command — stop, point the user at `references/gitguardian-platform.md`, and let them mint a PAT first.

Every recipe below uses `-sS` (silent except for errors) and `-w '\n%{http_code}\n'` so the agent can parse the body and the HTTP status in one shot. Pipe through `jq` for human-readable output. The shell variable `INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"` is assumed.

---

## 1. List incidents

`GET /v1/incidents/secrets`

Used to find incidents to act on. Cursor-paginated; the `Link` response header carries `next`/`prev` URLs.

Common query parameters:

| Param | Type | Example | Notes |
|---|---|---|---|
| `status` | enum | `TRIGGERED`, `RESOLVED`, `IGNORED`, `ASSIGNED` | Repeat for OR. |
| `severity` | enum | `critical`, `high`, `medium`, `low`, `info`, `unknown` | |
| `detector_group_name` | string | `aws_iam`, `github_access_token` | See `ggshield secret list-detectors` or the detectors API. |
| `source_id` | int | `12345` | Restrict to one repo / Slack workspace / etc. |
| `assignee_email` | string | `alice@example.com` | Returns incidents assigned to that member. |
| `from_date`, `to_date` | ISO 8601 | `2026-01-01T00:00:00Z` | Filters on `date` (first-seen). |
| `ordering` | string | `date`, `-date`, `resolved_at` | Prefix `-` for descending. |
| `per_page` | int | `20` (default), max `100` | |
| `cursor` | string | (opaque) | From the `Link` header `next` URL. |

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  "$INSTANCE/v1/incidents/secrets?status=TRIGGERED&severity=high&per_page=20"
```

**Response shape (per item):**

```json
{
  "id": 123456,
  "date": "2026-05-20T12:34:56Z",
  "detector": { "name": "aws_iam", "display_name": "AWS IAM Key", "nature": "specific", "family": "apikey" },
  "secret_revoked": false,
  "secret_hash": "abcd...",
  "status": "TRIGGERED",
  "assignee_id": null,
  "assignee_email": null,
  "occurrences_count": 3,
  "ignore_reason": null,
  "severity": "high",
  "share_url": null
}
```

---

## 2. Get incident detail

`GET /v1/incidents/secrets/{id}`

Use after listing, or when the user references a specific incident ID. Returns the full incident object including occurrences (`occurrences[]` with `filepath`, `line_end`, `commit_hash`, etc.) and notes.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID"
```

---

## 3. List members (resolve email → ID)

`GET /v1/members`

The `assign` endpoint takes either `member_id` (int) or `email`. Email is more ergonomic for an agent receiving instructions in natural language; ID is more stable across email changes. Both are documented — prefer email unless the user gave you an explicit ID.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
EMAIL="alice@example.com"

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -G --data-urlencode "search=$EMAIL" \
  "$INSTANCE/v1/members"
```

Response is a paginated list of members; pick the entry whose `email` matches exactly (the `search` param is a substring match, so always verify).

---

## 4. Assign an incident

`PATCH /v1/incidents/secrets/{id}/assign`

**Body (one of):**

```json
{ "email": "alice@example.com" }
```

or

```json
{ "member_id": 42 }
```

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456
EMAIL="alice@example.com"

curl -sS -w '\n%{http_code}\n' -X PATCH \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/assign"
```

Returns the updated incident. 409 if the incident is already closed (resolved/ignored) — reopen first if reassignment is intended.

---

## 5. Unassign an incident

`PATCH /v1/incidents/secrets/{id}/unassign`

No body required.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456

curl -sS -w '\n%{http_code}\n' -X PATCH \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/unassign"
```

Idempotent — unassigning an already-unassigned incident returns 200 with the current state.

---

## 6. Ignore an incident

`PATCH /v1/incidents/secrets/{id}/ignore`

**Body (required):**

```json
{ "ignore_reason": "test_credential" }
```

`ignore_reason` is an enum: `test_credential` | `false_positive` | `low_risk`. See [`lifecycle.md`](lifecycle.md) for which to pick. Always add a note (Endpoint 9) explaining the rationale if you pick `low_risk`.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456
REASON="test_credential"

curl -sS -w '\n%{http_code}\n' -X PATCH \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"ignore_reason\":\"$REASON\"}" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/ignore"
```

422 if `ignore_reason` is omitted or not one of the three enum values. 409 if the incident is already closed.

---

## 7. Resolve an incident

`PATCH /v1/incidents/secrets/{id}/resolve`

**Body (one of):**

```json
{ "secret_revoked": true }
```

or

```json
{ "secret_non_sensitive": true }
```

Set `secret_revoked: true` **only** when the user has confirmed the underlying credential was rotated, deleted, or otherwise neutralized. Setting it falsely distorts compliance reports. If the secret is real but you don't want to claim revocation, do **not** resolve — `ignore` with `low_risk` and a note is the right move.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456

curl -sS -w '\n%{http_code}\n' -X PATCH \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"secret_revoked":true}' \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/resolve"
```

409 if the incident is already resolved or ignored.

---

## 8. Reopen an incident

`PATCH /v1/incidents/secrets/{id}/reopen`

No body required. Moves a `RESOLVED` or `IGNORED` incident back to open. If a previous assignee was set, it is preserved.

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456

curl -sS -w '\n%{http_code}\n' -X PATCH \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/reopen"
```

409 if the incident is already open.

---

## 9. Add a note

`POST /v1/incidents/secrets/{id}/notes`

**Body (required):**

```json
{ "comment": "Rotated the key on 2026-05-25. New key issued via Vault." }
```

```bash
INSTANCE="${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}"
INCIDENT_ID=123456
COMMENT="Rotated the key on 2026-05-25. New key issued via Vault."

curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg c "$COMMENT" '{comment:$c}')" \
  "$INSTANCE/v1/incidents/secrets/$INCIDENT_ID/notes"
```

Use `jq -nc --arg` (as above) to build the JSON body when the comment may contain quotes, newlines, or shell metacharacters. Do not interpolate user-provided text directly into a `-d` string — that's a quoting bug waiting to happen.

Notes are visible to every workspace member with access to the incident. Treat the body as workspace-public.

---

## Parsing the trailing HTTP status

Every recipe ends responses with a literal `\n<code>\n`. To split body and status code:

```bash
RESPONSE="$(curl -sS -w '\n%{http_code}\n' ... )"
HTTP_CODE="$(printf '%s' "$RESPONSE" | tail -n 1)"
BODY="$(printf '%s' "$RESPONSE" | sed '$d')"

case "$HTTP_CODE" in
  2*) echo "OK"; printf '%s\n' "$BODY" | jq . ;;
  4*) echo "Client error $HTTP_CODE:"; printf '%s\n' "$BODY" | jq . ;;
  5*) echo "Server error $HTTP_CODE — retry later" ;;
esac
```

For one-shot debugging the agent can also use `--fail-with-body` (curl 7.76+), which exits non-zero on 4xx/5xx while still printing the body, and skip the trailing-code dance entirely.
