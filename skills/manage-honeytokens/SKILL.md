---
name: manage-honeytokens
description: Use when planting or deploying GitGuardian honeytokens into Confluence pages, Slack or Microsoft Teams channels, Jira or ServiceNow tickets, SharePoint or OneDrive documents, wikis and runbooks hosted there, or across integrated repositories; when listing honeytokens or reconciling which ones triggered and whether they are still in place; or when resetting, revoking, cleaning up, or rotating honeytokens. Not for one decoy in a local file (create-honeytokens), developer machines (ggshield honeytoken plant), or alert notification setup.
license: MIT
compatibility: Requires a GitGuardian workspace where the user holds a Manager seat or higher, the GitGuardian Developer MCP server (ggmcp) 0.8 or later for reads, a Personal Access Token with the honeytokens:read, honeytokens:write and sources:read scopes for the Honeytoken API, a shell with curl and jq, and a connector or direct token for each target source. Not available on the Free plan. Does not use the ggshield CLI.
metadata:
  version: "0.9.0" # x-release-please-version
---

# GitGuardian — Manage Honeytokens

## Overview

A honeytoken is a decoy AWS credential that raises an alert the moment someone tries to use it.
`create-honeytokens` generates one and plants it in a local file with `ggshield`. This skill owns
**everything after that, at scale**: deploying honeytokens into the sources GitGuardian already
scans (code hosts, chat, ticketing, knowledge bases, file storage), reconciling what is deployed
with what the server knows, telling which ones triggered, and running the lifecycle (reset,
revoke and clean-up, rotation) so the decoy in the source and the record on the GitGuardian
server never drift apart.

It speaks the same language as GitGuardian's endpoint protection: a **deployment** is one
honeytoken in one place, **plant** writes it there, **reconcile** compares desired and actual
state and emits `write` / `delete` actions, and each deployment ends `planted`, `failed` or
`removed`. Endpoints get that from the server through `ggshield honeytoken plant`; sources get it
from this skill.

Reads go through the GitGuardian Developer MCP server (ggmcp 0.8+): `list_honeytokens`,
`list_sources`, `get_my_identity`. Minting and every lifecycle write (reset, revoke, events,
sources, notes, tags) go through the Honeytoken API (`/v1/honeytokens...`) with a Personal Access
Token carrying `honeytokens:read` / `honeytokens:write` / `sources:read`, called from a shell so
the key pair can be piped straight into the target source without ever being printed (see rule 1
below and [references/honeytoken-api.md](references/honeytoken-api.md)). ggmcp's
`generate_honeytoken` returns the pair in its response, which puts it in the conversation; the
same doctrine as `create-honeytokens` applies, so it is not the minting path here. Sources are
reached through a direct token the user holds for that source (kept in a file, never pasted into
the conversation), or, when only a connector exists, through that connector with the exposure
declared in the plan table.

**Endpoints are out of scope.** `ggshield honeytoken plant` already reconciles developer machines
with the server; do not touch `~/.aws` or the `endpoint-deployments` endpoints from here.

## Start Here — Read This Before Doing Anything

1. **The key pair never enters the conversation.** A honeytoken looks like a real AWS key; a
   reader of the transcript or the logs can trigger it, and a model provider's logs are a leak
   surface of their own. Same rule as `create-honeytokens`. Mint and write in one shell pipeline:
   `POST /v1/honeytokens` → `jq` → the source's API (`chat.postMessage`, a Confluence page body,
   a Jira comment, a contents commit), with `set +x`, no `echo`, and only ids, permalinks and
   `access_token_id` printed back. Recipes in
   [references/honeytoken-api.md](references/honeytoken-api.md). Do not mint with ggmcp's
   `generate_honeytoken` (its response carries the pair) and do not call `list_honeytokens` with
   `show_token: true` unless the user has accepted the exposure. When the only write path is a
   connector tool call (the message text is a tool argument), the pair will enter the
   conversation: say so in the plan table and let the user choose between accepting it, holding a
   direct token for the source, or pasting the block themselves from a file you wrote with the
   API.
2. **One honeytoken per deployment, always.** A token planted twice tells you nothing when it fires.
   Every planting, re-planting or rotation mints a distinct token per channel, page, ticket, drive
   item or repository. The corollary: **a minted token that is not planted is an orphan.** It
   consumes one of the workspace's active-honeytoken slots and protects nothing. Count active
   tokens before a campaign, and when a plant fails after the mint, revoke the orphan in the same
   run (or list it by id for revocation) rather than leaving it active.
3. **The server confirms where it found the token; the registry says where you put it.**
   `GET /v1/honeytokens/{id}/sources` lists every integrated source (repositories, Slack, Teams,
   Jira, ServiceNow, Confluence, SharePoint, OneDrive, registries, S3) where the GitGuardian scanner
   saw the token, with the elements it was found in — but only after the next scan, only for
   sources in the perimeter, and without the exact locator or removal instructions. So every plant
   also writes a *deployment record* on the honeytoken itself (custom tags + a `GG-DEPLOYMENT`
   note) in the same step. Reconcile reads both and treats "planted but never listed by
   `/sources`" as the placement failing the scanner-visibility test. Schema in
   [references/deployment-registry.md](references/deployment-registry.md). (The public OpenAPI
   spec still types `/sources` as VCS-only; that is a spec defect, HON-1471.)
4. **Same workspace, or no plant.** A honeytoken is only a honeytoken to the workspace that
   minted it. To any other GitGuardian workspace monitoring the same source it is a plain, valid
   AWS key: a real incident is raised, the key is validity-checked against AWS (which triggers the
   token) and an in-source alert may be posted right under the decoy, burning it. Before writing
   into any monitored source, confirm that the source is integrated in the **same** workspace as
   the minting credential: `list_sources` (or `/v1/sources`) on that workspace must list the
   channel / space / project / repository, and `workspace_id` must match between every credential
   in play (MCP session, PAT). If the source is monitored by another workspace, or by a
   GitGuardian app you cannot attribute, stop and say so; do not plant. On a first campaign for a
   surface, run one **canary** in a throwaway location and confirm three things before scaling:
   no incident raised on the workspace's own honeytoken, no alert posted in the source, and
   `/sources` lists the location after the next scan.
5. **Know what the connector can undo before you write with it.** For the element type you will
   plant in (message, page, comment, file), check whether the available connector can **write**,
   **edit** and **delete** it, and whether it alters the content (an assistant connector may
   append a "Sent using …" footer that tells every reader the decoy was agent-posted). Only
   write + edit + delete gives unattended removal and rotation; anything less is declared in the
   plan table *before* go ("delete(old): you — the connector cannot delete messages"), never
   discovered after the decoy is live. When the user holds a direct token for the source (a Slack
   user token, an Atlassian API token) kept in a file on their machine, prefer it: the agent calls
   the source API itself, the content is posted as the user with no footer, and edit/delete work.
6. **Plan, show, then write — in one round-trip.** Planting posts in a shared channel, edits a
   wiki page, or comments on a ticket. Scout the target, draft the exact content (realistic to an
   attacker, inert to a teammate), show one plan table with every default filled, and write
   only after the user says go. Same gate before reset, revoke, rotation and any removal from a
   source. **One gate per workflow, not per step**: once the user says go, run every step of the
   plan table to the end without asking again. Every write ends with the links table (see *Report
   format*).
7. **Reset is "false alarm"; revoke is "compromised"; rotation is "replace the decoy".** Reset keeps
   the same credentials and re-arms a triggered token. Revoke is terminal — the AWS key pair is
   deleted and there is no delete endpoint; "deleting" a honeytoken means applying `delete` at
   every registered deployment *and then* revoking it. Rotation is reconcile with a replacement,
   run as **one unattended transaction** after a single go: `write(new)` → read back →
   `delete(old)` at the same locator → revoke old → cross-link both tokens (runbook under
   *Workflows*). Never rotate or revoke a token that just triggered before the trigger has been
   investigated — the armed trap is the evidence.
8. **Every deployment: invisible to the people who use the source, unmissable to anything that
   scans it.** On every surface, put the decoy where real users do not open things but the
   integration indexes them — closed tickets, resolved threads, archived pages, attachments on
   old records, legacy folders — in a plain-text element with both halves of the pair in the
   standard shape every detector matches, and treat the GitGuardian scanner as the oracle: a
   deployment that `/sources` never lists after a full scan is moved, not kept. Repositories
   are the sharpest case: never the default branch at
   HEAD. Prefer a `history` placement (added then removed on the default branch — gone from the
   tree, present in every clone's history), else an open never-merged PR or a non-default branch,
   deployed through the host's API, in a plain-text file with both halves of the pair in the
   standard shape every detector matches. Expect the organisation's own verifying scanners
   (trufflehog in CI) to ring it; settle allowlisting before the first deployment. Full playbook
   in [references/vcs-playbook.md](references/vcs-playbook.md).
9. **If the write path is missing, degrade, don't improvise.** No API token means read-only
   reconcile through ggmcp plus a handoff of the exact dashboard action; no write path for a
   source means a paste block built from a file the API wrote, never from the conversation.
   Details in [references/honeytoken-api.md](references/honeytoken-api.md).

## When to Use

- "plant / seed / deploy / disseminate honeytokens in Slack, Teams, Jira, ServiceNow, Confluence,
  SharePoint, OneDrive", "seed decoys across our GitHub org / GitLab group / archived repos
  without the devs seeing them", "which honeytoken is in which repo"
- "list our honeytokens", "which honeytokens triggered / rang / are publicly exposed",
  "is the honeytoken in #ops-runbooks still there", "reconcile our honeytokens"
- "reset this honeytoken, it was one of ours", "revoke and remove this honeytoken",
  "rotate the honeytokens in the Confluence runbooks"
- Proactively when a user is about to open a channel, space or project to contractors, archive a
  repository, or asks how they would know if their wiki was scraped.

## When Not to Use

- Generating a single honeytoken for a file in the current repo — `create-honeytokens`.
- Planting on developer machines — `ggshield honeytoken plant` (endpoint protection) syncs with the
  server on its own.
- Triaging *real* secret incidents, including incidents linked from a triggered honeytoken's
  source — `triage-incidents`.
- Non-AWS decoys — only the `AWS` type exists; do not fabricate another provider's key.

## Onboarding (first use)

### Prerequisites

- **GitGuardian role:** Manager or above on the workspace. Each workspace has a limited number of
  active honeytokens (extendable through GitGuardian); revoked ones do not count. Orphans do.
- **GitGuardian Developer MCP server** connected (hosted: `https://mcp.gitguardian.com/mcp`, EU:
  `https://mcp.eu1.gitguardian.com/mcp`), version 0.8 or later. The reads this skill uses are
  `list_honeytokens` (`honeytokens:read`), `list_sources` (`sources:read`, proves the
  same-workspace precondition) and `get_my_identity` (workspace and scopes); ggmcp hides tools
  whose scope the token lacks. `generate_honeytoken` exists but is not used for minting here
  (rule 1).
- **API access for minting and the lifecycle:** a Personal Access Token created in the dashboard
  (API → Personal access tokens) with `honeytokens:read`, `honeytokens:write` and `sources:read`
  (needed for `/sources` on every surface, not only repositories). Expose it as
  `GITGUARDIAN_API_KEY` where an environment exists; where none can be set (Cowork, hosted
  sessions), keep it in a file inside a connected folder and reference it as `$(cat <path>)` in
  each command so the value never enters the conversation. The MCP's OAuth session and a
  `ggshield auth login` token do **not** stand in for it — it is a separate credential.
  `GITGUARDIAN_API_URL` defaults to `https://api.gitguardian.com`; EU is
  `https://api.eu1.gitguardian.com`; self-hosted is `https://<instance>/exposed`.
- **A write path for each target source.** Preferably a direct token the user keeps in a file,
  as above (a Slack user token, an Atlassian API token, a GitHub or GitLab token), which lets the
  shell pipeline post the pair without printing it, as the user, with edit and delete available.
  Otherwise a connector (Slack, Microsoft Teams / SharePoint / OneDrive, Jira / Confluence,
  ServiceNow, GitHub, GitLab), with the exposure and capability limits declared in the plan table.
  A surface with neither is still plantable — the skill writes the content to a file with the API
  and hands the paste to the user.

### Setup

1. Cheap read to prove connectivity and scope: `list_honeytokens` with `per_page: 1`. If the tool is
   absent, the token lacks `honeytokens:read` or the server is not connected — see
   [references/gitguardian-platform.md](references/gitguardian-platform.md) for scope recovery.
2. `curl -sS -H "Authorization: Token <PAT>" "$GITGUARDIAN_API_URL/v1/api_tokens/self"`
   confirms the API key and lists its `scopes` before the first call; a `403` on a honeytoken
   endpoint afterwards means a sub-Manager role. **Compare its `workspace_id` with the MCP's
   `get_my_identity` before any write**: a honeytoken minted in one workspace is invisible from
   the other, and mixing the two silently creates orphans. On a mismatch, say which credential
   sees what and ask which workspace is intended; do not merge their inventories.
3. For each source the user named: which write path exists (connector or direct token), whether it
   can write / edit / delete the target element, whether it alters content (footer), and whether
   `list_sources` shows that source in this workspace. Say which surfaces will be fully automated,
   which will need one manual step, and which fail the same-workspace precondition.
4. Before a campaign (more than a couple of deployments), `list_honeytokens` with `status: active`
   and state the count against the workspace quota if known; a campaign that would exceed it is
   split or escalated, not started.

## Fast path — one prompt, one confirmation, three links

Users have minutes, not an afternoon. When the ask names a surface ("put a honeytoken in our
Confluence OPS space", "seed #infra-oncall", "cover the payments repo"), do not interview them:
scout, pick the best genuine location yourself, fill every default (name, description, method,
tags, rotation `on-change`), and come back with **one** plan table and one question — "go?".
The plan table always carries two pre-flight rows: *workspace* (source listed by `list_sources`
in workspace N, or "not monitored", or "monitored by another workspace — refusing") and
*write path* (direct token or connector; write / edit / delete / footer; whether the pair will
enter the conversation; and who performs `delete(old)` if ever needed).
Then plant, register, read back, and hand over the proof: for every deployment, the three links
in the **Report format** below, plus the one-line **Prove it** test. Ask follow-up questions only
when something is genuinely undecidable (two equally good spaces, no write path for the surface).
A full dialogue is for "help me design a dissemination strategy", not for "plant one".

## Report format — every write ends with links

People will not take the agent's word for it. Every plant, reconcile, reset, revoke and rotate
report is a table with one row per deployment and these columns, each a clickable URL:

| Honeytoken (GitGuardian) | Source as GitGuardian sees it | Exactly where the decoy sits | Status |
|---|---|---|---|
| `gitguardian_url` of the token (name as link text) | `/sources[].url` once the scanner has listed it, else "not scanned yet" | the permalink to the message, page anchor, ticket comment, file, commit or PR | `planted` / `detected` / `triggered` / `removed` |

The third column is the one users click first; build it from the locator with the URL recipes in
[references/planting-playbook.md](references/planting-playbook.md) and never print a bare id when
a permalink exists. Follow the table with the next check ("`/sources` should list it after the
next scan of <source>; say `reconcile` to check") and the alert route. For a triggered token
add the event link (`/honeytokens_events[].gitguardian_url`). A rotation report has two rows:
the new token `planted` and the old one `removed` (or `removed — pending your delete` when the
write path could not remove it).

## Workflows

Each workflow is a short runbook in [references/lifecycle-workflows.md](references/lifecycle-workflows.md).

| Ask | Workflow | Reads | Writes (confirmation-gated) |
|---|---|---|---|
| plant / deploy | **Plant** — pre-flight (same workspace, write-path capabilities, quota headroom), pick surface, scout, one token per deployment, draft the artifact with placeholders, register `pending`, mint-and-write in one pipeline, read back, set `planted`; on failure after the mint, revoke the orphan | `list_sources`, source connector, `list_honeytokens` | `POST /honeytokens` with tags piped into the source API; `POST notes`; `POST /revoke` on an orphan |
| list / which triggered / still there? | **Reconcile** — list, join with events and `/sources`, read each deployment from its source, derive `write` / `delete` / `revoke` / `ask` / `review`; an active token with no `GG-DEPLOYMENT` note is reported as an orphan | `list_honeytokens`, `/honeytokens_events`, `/sources`, `/notes`, source connector | none; applying an action is a separate gated step |
| it was one of ours | **Reset** — read events, confirm benign origin, re-arm, note the reason | `/honeytokens_events` | `POST /reset`, `POST notes`, optional IP allowlist handoff |
| remove / delete / decommission | **Revoke and clean up** — apply `delete` at every deployment first (`removed`), then revoke | registry, source connector | source delete/edit, `POST /revoke`, `POST notes` |
| rotate / refresh | **Rotate** — one go, then unattended: mint new (tags carried over + `replaces`), `write(new)`, read back, `delete(old)` through the write path, `POST /revoke` old, cross-link notes on both tokens; see runbook below | registry, `/honeytokens_events` (old must not be under investigation), source connector | mint, source write + delete (or edit in place), `POST notes` ×2, `POST /revoke` |
| does it work? / show me | **Prove it** — a controlled trigger from the user's own machine (a command that reads the pair from the API with their PAT and runs `sts get-caller-identity`, never a pasted pair), the event shown with its link, then reset and an allowlist proposal | `/honeytokens_events`, `get_honeytoken` | `POST /reset`, `POST notes` (after the user confirms it was them) |

### Rotate — runbook

The user confirms once, on the plan table; everything after is automatic.

1. **Pre-flight.** Read the old token: `status` not `revoked`; if `triggered`, stop and route to
   Reset or investigation first. Read its `GG-DEPLOYMENT` note for the locator. Check the write
   path's capabilities for that element (write / edit / delete) and put the result in the plan
   table: `delete(old)` is "me" or "you".
2. **Mint new** with the same `surface`, `location`, `planted-by`, `rotation` tags plus
   `replaces=<old id>`, name `<old name>-r<N>` (same month) or the new month, and a `pending`
   note carrying `replaces_honeytoken_id` and the old `gitguardian_url`.
3. **`write(new)`.** Prefer an in-place **edit** of the old element when the write path can edit
   (same permalink, nothing to delete); otherwise post the new element at the same locator. Read
   it back from the source.
4. **`delete(old)`** through the write path. If it cannot delete, this is the only manual step:
   state the exact element (permalink, ts, comment id) and wait for one word; do not revoke before
   the old decoy is gone — a revoked key left in place is dead bait that stops alerting and tells
   a careful attacker the organisation plants decoys.
5. **Revoke old** (`POST /v1/honeytokens/{old}/revoke`), then write the cross-links: on the old
   token a note `GG-DEPLOYMENT status: removed, replaced_by: <new id> <new gitguardian_url>,
   removed_at, removed_by`; on the new token the `planted` note with the new locator, permalink and
   `replaces: <old id> <old gitguardian_url>`. Add the `replaced-by` tag on the old token when the
   key has `custom_tags:write`.
6. **Report** the two-row links table (new `planted`, old `removed`) and the Prove-it line for the
   new pair.

Where to plant on each surface, the placement methods and their templates, the connector calls to
use, and how to verify and remove: [references/planting-playbook.md](references/planting-playbook.md).
Repositories — placements that hide from teammates and show to every scanner, host-API commits,
push protection, self-inflicted triggers, `/sources` cross-checks: [references/vcs-playbook.md](references/vcs-playbook.md).
Endpoints, scopes, object fields and `curl` recipes: [references/honeytoken-api.md](references/honeytoken-api.md).

## Best Practices

- **Default to the most genuine placement the surface allows.** A credentials block in an existing
  runbook beats a new page titled "secrets"; a pinned message in a real ops channel beats a fresh
  channel; a config attachment on a real deployment ticket beats a ticket created for the decoy.
  For a named surface, pick it and ask only "go?"; ask about strategy only for a campaign.
- **Name mechanically, describe for the on-call six months from now.** Name:
  `<surface>-<location-slug>-<YYYY-MM>`. Description (max 250 chars): where, why, who, when.
- **Registry in the same transaction as the plant.** Tags `surface`, `location`, `planted-by`,
  `rotation` plus one `GG-DEPLOYMENT` note carrying the `access_token_id` (the search needle), the
  placement `method` and `config`, the exact locator (channel id + message ts, page id, issue key,
  drive item id, repo + path + branch) and a `status` (`pending` → `planted` / `failed` /
  `removed`). Pass the tags in the `POST /v1/honeytokens` body so the token is never active
  without its registry; `PATCH` is for later changes. Rotations link both directions:
  `replaces` on the new token, `replaced_by` on the old, each with the other's `gitguardian_url`.
- **Realistic to attackers, inert to teammates.** Attackers skim for `AKIA...` next to
  `aws_secret_access_key`; teammates must never be tempted to use it. Put it in a block that reads
  as legacy or environment-specific (`# legacy backup bucket, keep for the migration`), never in a
  snippet a teammate would copy into a working setup. A message that visibly comes from a bot or
  carries an assistant footer is neither realistic nor inert; post as a human when the surface is
  shared.
- **Read events before acting on a token.** The honeytoken's own `tags` (`publicly_exposed` means
  GitGuardian saw it on public GitHub — the location leaked), then each event's `ip_address`,
  `action` and `data` (user agent, country, request details — shape varies by action) decide reset
  vs revoke. Event-level `tags` carry the dashboard's IP labels (public-monitoring IP, AWS internal
  IP, custom IP rules); print them as returned rather than matching on a literal string.
  Allowlisted sources produce `allowed` events that never trigger.
- **Rotation cadence is a policy, not a reflex.** Default to rotating when a location changes
  owner or exposure (a space goes external, a repo is archived, a contractor leaves), or on a
  schedule the user sets; record it in the `rotation` tag so reconcile can flag overdue deployments.
- **Stay read-only until the user opts into a specific write**, and state which surface and which
  honeytoken each write touches.

## Troubleshooting

- **`403` on `POST /v1/honeytokens`** — the PAT lacks `honeytokens:write`, or the user is below
  Manager. Scope recovery in [references/gitguardian-platform.md](references/gitguardian-platform.md);
  the role fix is a workspace admin's. If `list_honeytokens` is also missing from ggmcp, the MCP
  token lacks `honeytokens:read` as well.
- **The pair ended up in the conversation** (a connector tool call, a `cat`, a `show_token`
  read) — treat it as exposed: the transcript and any log of it can now trigger the token, so a
  later event may be a reader, not an attacker. Say so in the deployment note, and prefer
  rotating it through the shell pipeline once a direct token for the source is available.
- **`token` fields come back as `<GG>OBFUSCATED</GG>`** — some ggmcp builds mask honeytoken
  values in their outputs, which is consistent with rule 1. Nothing to fix: this skill mints with
  `POST /v1/honeytokens` from the shell, which accepts tags in the same call. If the call was
  made anyway, revoke the orphan it minted.
- **`Could not create honeytoken: name ... already exists`** — names are unique among *active*
  tokens. Append the location slug or the month; never reuse a revoked token's name for a
  different location.
- **`generate_honeytoken` returned an existing token** — `new_token` defaults to `false`, which
  reuses the most recent active token. Another reason not to mint through it; if it must be
  used, pass `new_token: true` and treat the pair as exposed (rule 1).
- **A GitGuardian alert or incident appeared on the decoy itself** — the source is monitored by a
  workspace other than the one that minted the token (rule 4). The decoy is burned: remove it,
  revoke the token, resolve the foreign incident, and re-plant from the right workspace.
- **`/sources` is empty for a deployment** — the source is not in the GitGuardian perimeter, the
  next scan has not run yet, or the decoy sits in something the integration does not index (a
  Slack canvas, an image, a binary attachment). Verify through the connector meanwhile; if the
  listing never appears after a full scan, the placement failed the scanner-visibility test:
  move it to an indexed element (message, attachment, page body, file) and re-plant.
- **Generated API clients reject non-VCS `type` values on `/sources`** — the public OpenAPI spec
  still types that field as VCS-only (HON-1471); read the raw JSON.
- **Push protection blocked the commit** — expected on a scanner-visible placement. Use the host's
  documented bypass for that one push, or the dashboard's Deployment jobs, and tell the user.
- **A repository token rings on every CI run** — a verifying scanner (trufflehog) is calling AWS
  with it. Allowlist the CI egress IPs or turn verification off for AWS; see `vcs-playbook.md`.
- **A token shows `publicly_exposed`** — it has been seen on public GitHub. Treat the location it
  was planted in as leaked, hunt for real credentials that lived next to it, and route the secret
  incidents to `triage-incidents`. Do not reset until the investigation is done.
- **Events stopped arriving** — a token pauses new event reception at 100 open events. Reset (or
  revoke) once investigated; both close the open events.
- **`400 Invalid data` on `/reset` or `/revoke`** — reset only applies to a `triggered` token, and
  neither applies to one already `revoked`. Re-read the token's `status` first.
- **Any other error** — consult https://docs.gitguardian.com/llms.txt, then append `.md` to the
  relevant page URL to read it as Markdown (for example
  https://docs.gitguardian.com/honeytoken/respond.md).