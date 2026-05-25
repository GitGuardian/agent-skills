---
name: triage-incidents
description: Use when you need to change a GitGuardian secret-incident's state — assign, ignore (with reason), resolve, reopen, or add a note. Auto-triggers when the user asks to triage, close, follow up on, or take action on incidents in their workspace. Uses the GitGuardian public REST API directly via curl; complements the read-only GitGuardian Developer MCP server.
---

# Triage GitGuardian secret incidents

## Overview

This skill teaches the agent to drive the *write* side of GitGuardian's secret-incident lifecycle through the public REST API: assign an incident to a teammate, ignore it with a reason, resolve it after rotation, reopen a closed one, and post notes.

**Why the API, not `ggshield` or the Developer MCP server.** `ggshield` has no `incidents` subcommand — its surface is scanning, honeytokens, HMSL, and machine scans. The GitGuardian Developer MCP server (`ggmcp`) covers incident *reads* (`list_incidents`, `count_incidents`, `get_incident`, `list_repo_occurrences`, `list_incident_members`, `list_incident_teams`) and a guided remediation flow (`remediate_secret_incidents`) — but no write actions. State transitions only exist in the public API. This skill is the agent's path into that surface.

**Core rule:** every write call (PATCH/POST) must be previewed to the user before it fires. The skill is interactive by design — no silent state changes, no silent bulk loops.

## Start Here — Read This Before Doing Anything

**Do not skip this section.**

- **Preview before every write.** Print the incident ID, current state, target state, and full request body. Stop. Wait for an explicit user confirmation. This is non-negotiable for `assign`, `unassign`, `ignore`, `resolve`, `reopen`, and `notes`.
- **Multi-incident workflows: list, confirm, loop.** There is no bulk-PATCH endpoint. If the user asks for "ignore all test incidents older than 90 days" or similar, list the candidates first, show the user the set, get a single explicit OK, then loop one-by-one (no parallelism without explicit user OK). Document each failure; do not retry silently on 4xx.
- **Never set `secret_revoked: true` without explicit user confirmation that the underlying credential was actually rotated.** Claiming revocation that didn't happen is the most common quiet failure mode for this workflow and it distorts compliance reporting. When in doubt, prefer `ignore` with `ignore_reason: low_risk` plus an explanatory note.
- **Pick the right `ignore_reason`.** `test_credential` is for fixtures and examples with no production reach. `false_positive` is for non-secret content the detector matched. `low_risk` is for real credentials with contained blast radius. Picking the wrong one is harder to fix than asking the user one extra question. See [references/lifecycle.md](references/lifecycle.md) for the full taxonomy.
- **Prefer the Developer MCP server for reads.** When the agent has access to `mcp__GitGuardianDeveloper__list_incidents` / `get_incident` / `count_incidents`, use those — they're cheaper to invoke and return typed data. Fall back to the API list/get endpoints only when the MCP isn't available.

## When to Use

Use this skill when:

- The user asks to assign an incident to themselves or a teammate
- The user asks to ignore an incident as a test credential, a false positive, or low-risk
- The user confirms a credential was rotated and asks to close the corresponding incident
- The user asks to reopen a previously-closed incident (e.g., a `low_risk` ignore that turned out to be material)
- The user asks to leave a note on an incident — rotation date, ticket link, decision rationale
- The user asks for a multi-incident triage pass ("ignore all incidents with detector X from before Y")

Do **not** use this skill when:

- The user only wants to *view* incidents — that's the Developer MCP's read tools, or a single `GET` from [references/api-reference.md](references/api-reference.md)
- The user wants to *scan* for new secrets — that's the `scan-secrets` skill (`ggshield secret scan ...`)
- The user is asking about Public Monitoring (public GitHub leaks) — that's a separate surface (`list_public_incidents` on the MCP); the write actions in this skill do not apply

For the conceptual state model, ignore-reason taxonomy, resolution semantics, multi-incident loop pattern, and error-code recovery, see [references/lifecycle.md](references/lifecycle.md).
For the per-endpoint curl recipes, request and response shapes, and HTTP-status parsing patterns, see [references/api-reference.md](references/api-reference.md).
For platform-wide topics that span every GitGuardian skill (public docs URL pattern, PAT minting, scope recovery, instance URLs, headless setup), see [references/gitguardian-platform.md](references/gitguardian-platform.md).

## Onboarding (first use)

### Prerequisites

- **A Personal Access Token (PAT)** with scopes `incidents:read`, `incidents:write`, and `members:read`. The first two cover the read+write surface; `members:read` is needed to resolve email addresses to member IDs for assignment.
- **`curl` and `jq`** on PATH. `curl` 7.76+ is recommended for `--fail-with-body`, but any modern `curl` works with the explicit trailing-status pattern documented in [references/api-reference.md](references/api-reference.md).
- **A reachable GitGuardian instance**. Default is `https://api.gitguardian.com`. For EU, dedicated, or self-hosted workspaces, set `GITGUARDIAN_INSTANCE_URL` — see `references/gitguardian-platform.md`.

### Setup

Before running any command, the agent must confirm the environment is configured:

```bash
test -n "$GITGUARDIAN_API_KEY" && echo "API key set" || echo "MISSING: GITGUARDIAN_API_KEY"
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Token $GITGUARDIAN_API_KEY" \
  "${GITGUARDIAN_INSTANCE_URL:-https://api.gitguardian.com}/v1/incidents/secrets?per_page=1"
```

Expected: `API key set` and HTTP `200`. A `401` means the token is missing or invalid; a `403` means the scopes are insufficient. In both cases, point the user at `references/gitguardian-platform.md` to mint or rescope a PAT — do not proceed with write calls until both checks pass.

Briefly tell the user what this skill enables before the first write:

- Assign incidents to workspace members by email or member ID
- Ignore incidents with a structured reason (`test_credential`, `false_positive`, `low_risk`)
- Resolve incidents after the underlying credential has been rotated
- Reopen previously-closed incidents
- Post notes on incidents — rotation timestamps, ticket links, decision context

## Commands

The per-endpoint reference (URLs, query params, request bodies, response shapes, error codes) lives in [references/api-reference.md](references/api-reference.md). Always read that file before constructing a write call — the body shapes are not memorizable.

The commands the skill exposes:

| Action | Method + path | Body shape (summary) |
|---|---|---|
| List incidents | `GET /v1/incidents/secrets` | query params: `status`, `severity`, `detector_group_name`, `source_id`, `assignee_email`, `from_date`, `to_date`, `ordering`, `per_page`, `cursor` |
| Get incident | `GET /v1/incidents/secrets/{id}` | — |
| Resolve member email → ID | `GET /v1/members?search=<email>` | — |
| Assign | `PATCH /v1/incidents/secrets/{id}/assign` | `{ "email": "..." }` or `{ "member_id": N }` |
| Unassign | `PATCH /v1/incidents/secrets/{id}/unassign` | — |
| Ignore | `PATCH /v1/incidents/secrets/{id}/ignore` | `{ "ignore_reason": "test_credential" \| "false_positive" \| "low_risk" }` |
| Resolve | `PATCH /v1/incidents/secrets/{id}/resolve` | `{ "secret_revoked": true }` or `{ "secret_non_sensitive": true }` |
| Reopen | `PATCH /v1/incidents/secrets/{id}/reopen` | — |
| Add note | `POST /v1/incidents/secrets/{id}/notes` | `{ "comment": "..." }` |

Always preview the action before the write. Minimum preview template:

```
About to <action> incident #<id>.
  Current state: <status from GET>
  Target state:  <expected status after PATCH>
  Body:          <JSON body>
Proceed? (yes / no)
```

For multi-incident actions, the preview lists the full set of incident IDs and the single shared action, and asks for one confirmation. The loop then runs one PATCH at a time and aggregates results.

## Best Practices

- **Read before you write.** When the user references an incident by ID, fetch the current state first (`GET /v1/incidents/secrets/{id}`). The agent will spot stale assumptions — an incident the user thought was open is already resolved, an assignee has changed — before issuing a transition that 409s.
- **Treat note bodies as workspace-public.** Anyone with access to the incident can read them. Do not paste raw credentials, internal hostnames, or PII into a note.
- **Add a note whenever you ignore with `low_risk`.** "Real credential, contained scope" is a defensible call; "real credential, ignored because" with no reasoning is audit debt.
- **Watch the quota.** Every API call counts against the workspace quota. Run `ggshield quota` if a long loop is planned; back off on 429.
- **Idempotency awareness.** `unassign` on an unassigned incident is fine. `resolve` on a resolved incident returns 409 — fetch the state if you're looping over stale data.

## Troubleshooting

**`MISSING: GITGUARDIAN_API_KEY`** — the env var is unset. Have the user export it from their PAT, or follow `references/gitguardian-platform.md` to mint one.

**`HTTP 401`** — the token is missing or invalid. Verify with the setup check above. Mint a fresh PAT if needed.

**`HTTP 403`** — the token is valid but missing a scope. For writes the token needs `incidents:write`; for assignment it also needs `members:read`. Rescope per `references/gitguardian-platform.md`.

**`HTTP 404` on a known incident ID** — the token is for a different workspace than the one the user thinks the incident lives in. Confirm with `GET /v1/incidents/secrets?per_page=1` against the expected instance URL.

**`HTTP 409` on a state transition** — the incident isn't in a state that allows the transition. Fetch the current state, then pick the right action (e.g., `reopen` before `assign` on a closed incident). See the state machine in [references/lifecycle.md](references/lifecycle.md).

**`HTTP 422` on `ignore`** — `ignore_reason` is missing or not one of `test_credential` / `false_positive` / `low_risk`.

**`HTTP 429`** — rate-limited. Back off; do not auto-retry without a delay. The workspace API quota is shared across this skill and `ggshield`.

**Member lookup returns multiple results for an email** — the `search` param on `GET /v1/members` is a substring match. Verify the returned member's `email` field matches exactly before using their `id` for assignment, or pass `email` directly to `/assign` and let the server resolve it.
