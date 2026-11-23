# Deployment Registry

Loaded on demand from `SKILL.md`. Defines the **deployment** record this skill keeps for every
honeytoken it plants in a source, and the **reconcile** procedure that compares that record with
the server and the source and turns the difference into `write` / `delete` actions.

The vocabulary is deliberately the one GitGuardian already uses for endpoints
(`POST /v1/honeytokens/endpoint-deployments`, `ggshield honeytoken plant`): a *deployment* is the
relationship between one honeytoken and one place; *planting* is the act of writing it there; a
*placement method* says how it is materialized; *reconciling* compares desired and actual state and
emits `write` (should be present) or `delete` (revoked, remove the stale artifact); the client
reports `planted`, `failed` or `removed`. Endpoints get all of this from the server; sources get it
from this registry: the server lists the sources and elements where its scanner *found* the
token (`/sources`), the registry holds where the agent *put* it, how, and how to remove it.

## Why a registry

`GET /v1/honeytokens/{id}/sources` lists every integrated source where the GitGuardian scanner
found the token — repositories, Slack, Teams, Jira, ServiceNow, Confluence, SharePoint, OneDrive,
registries, S3 — with the elements (`files[]`) it was found in. That is the server's view, and it
is authoritative for *detection*: a deployment the scanner never lists is not scanner-visible.
It is not enough on its own. It appears only after the next scan of that source, only for sources
in the perimeter, it names elements rather than exact locators (a message timestamp, a page
anchor, a commit SHA), it carries no removal instructions, and the public API does not expose
whether the element is still present. Without a deployment record nobody can re-plant a drifted
decoy at the same spot, remove it cleanly after revocation, or rotate it in place.

The registry lives **on the honeytoken, on the GitGuardian server** — not in a local file, not in
a wiki — so every teammate and every agent session reads the same truth and the server stays the
system of record for both the token and its deployment. Two layers:

- **Custom tags** — short, filterable, visible in the dashboard list. Four keys.
- **One `GG-DEPLOYMENT` note** — the full deployment record, in a fenced JSON block.

Writing them is part of the plant step, never a follow-up. When creating through the API
(`POST /honeytokens`, `/with-context`) the tags go in the create body, so a token is never active
without them; `PATCH` is for later changes. A plant whose registry write fails is reported as a
failed plant and the orphan is revoked.

## Custom tags (one value per key)

| Key | Value | Example |
|---|---|---|
| `surface` | `slack`, `teams`, `jira`, `servicenow`, `confluence`, `sharepoint`, `onedrive`, `github`, `gitlab`, `bitbucket`, `azure_devops`, `registry`, `s3`, `other` | `confluence` |
| `location` | human-readable path, `<= 60` chars, slash-separated | `OPS/runbooks/postgres-failover` |
| `planted-by` | GitGuardian member handle or email local part | `<handle>` |
| `rotation` | `YYYY-MM` of the next planned rotation, or `on-change` | `2027-04` |

`PATCH /v1/honeytokens/{id}` replaces the whole `custom_tags` array: read the current set, drop
these four keys and the seeded `type=aws` (it duplicates the token's `type` field), append the new
values, write back. `source=auto-generated` may stay.

Tag keys use hyphens (`planted-by`); JSON keys inside the note use underscores (`planted_by`).
Filter on the right spelling for each.

## Name and description

**Name** (unique among active tokens): `<surface>-<location-slug>-<YYYY-MM>`, for example
`slack-ops-runbooks-pinned-2026-10`, `jira-INFRA-2210-attachment-2026-10`,
`confluence-ops-postgres-failover-2026-10`, `gitlab-payments-legacy-env-2026-10`. On rotation the
month changes, so the new name never collides with the old.

**Description** (max 250 chars), prose, in this order: where, why, who, when.
`Planted in Confluence OPS > Runbooks > Postgres failover (credentials block) to detect wiki
scraping by exfiltrated accounts; <handle>; <YYYY-MM-DD>.`

## The `GG-DEPLOYMENT` note

A note starting with `GG-DEPLOYMENT`, created with `POST /v1/honeytokens/{id}/notes` (`comment`,
max 10 000 chars). Its fields mirror the endpoint deployment object where the concepts match
(`type`, `method`, `config`, `status`, `action`, `planted_at`) and add what a source needs
(`surface`, `location`, `url`, `locator`).

~~~
GG-DEPLOYMENT v1
```json
{
  "access_token_id": "AKIA...",
  "type": "aws",
  "surface": "confluence",
  "location": "OPS/runbooks/postgres-failover",
  "url": "https://acme.atlassian.net/wiki/spaces/OPS/pages/8831012/Postgres+failover#Credentials",
  "gg_source_url": null,
  "locator": { "cloud_id": "…", "page_id": "8831012", "anchor": "Credentials (legacy backup bucket)" },
  "method": "credentials_profile",
  "config": { "profile_name": "backup-legacy", "wrapper": "code macro", "intro_line": "legacy backup account, kept until the cross-account role is live" },
  "status": "planted",
  "planted_at": "<ISO-8601>",
  "planted_by": "<handle>",
  "planted_by_hand": false,
  "rotation": "2027-04",
  "replaces_honeytoken_id": null,
  "verify": "fetch page 8831012, search body for access_token_id",
  "remove": "edit page 8831012, delete the code macro block whose first line contains the access_token_id"
}
```
~~~

Field by field:

- `access_token_id` — the AWS key id (never the secret). It is the search needle for every later
  verify, remove or swap, so none of them needs `show_token=true`.
- `type` — honeytoken kind, `aws` (mirrors the endpoint field).
- `surface`, `location` — same values as the tags, repeated so the note is self-sufficient.
- `url` — the exact permalink a human opens to land on the decoy (message permalink, page URL
  with anchor, ticket URL with `focusedCommentId`, file web URL, commit or PR URL). This is the
  third column of every report; build it with the surface's URL recipe in
  `planting-playbook.md`.
- `gg_source_url` — `/sources[].url` once GitGuardian has listed the source (null until the
  scanner-visibility test passes); reconcile fills it in.
- `locator` — what a connector needs. Surface-specific minimum fields:

  | Surface | `locator` fields |
  |---|---|
  | `slack` | `team_id`, `channel_id`, `channel_name`, `message_ts` (and `thread_ts` if in a thread), or `file_id` for an attachment |
  | `teams` | `team_id`, `channel_id`, `message_id`, or `drive_id` + `item_id` for a Files-tab document |
  | `jira` | `site`, `issue_key`, `where` (`description` / `comment:<id>` / `attachment:<id>:<filename>`) |
  | `servicenow` | `instance`, `table` (`kb_knowledge`, `incident`, `change_request`, ...), `sys_id`, `number`, `field` or `attachment_sys_id` |
  | `confluence` | `cloud_id` or `base_url`, `space_key`, `page_id`, `anchor` (heading text) or `attachment_id` |
  | `sharepoint` / `onedrive` | `drive_id`, `item_id`, `path`, `web_url`, `inside` (`body` / `cell:Sheet1!B7` / `attachment`) |
  | `github` / `gitlab` / `bitbucket` / `azure_devops` | `repo_url`, `placement` (`history` / `pr` / `branch` / `archived` / `tag`), `branch`, `path`, then per placement: `add_commit_sha` + `remove_commit_sha` + `merge_policy` (`history`), `commit_sha` + `pr_url` (`pr`), `commit_sha` (`branch`, `archived`), `tag` (`tag`). See `vcs-playbook.md` |
  | `registry` | `registry`, `image`, `tag`, `path_in_image` |
  | `s3` | `bucket`, `key`, `version_id` |

- `method` — placement method, how the credential pair is materialized: `credentials_profile`
  (an `[profile]` block, the endpoint's `aws_config_profile` shape), `dotenv`, `yaml`, `tfvars`,
  `code_context` (a file from `/with-context`), `attachment` (a whole file dropped into the
  artifact), `other`. Templates per method are in `planting-playbook.md`.
- `config` — the method's parameters (`profile_name`, `filename`, `wrapper`, `intro_line`,
  `language`), enough to re-materialize the exact same artifact on a re-plant or a swap.
- `status` — `pending` (minted, not yet written), `planted` (written and read back), `failed`
  (write failed; reconcile retries the same token), `removed` (artifact deleted after a `delete`
  action). Same four values as the endpoint PATCH, same meaning.
- `planted_at`, `planted_by` — when and who; `planted_by_hand: true` when the user pasted the
  content and reported the locator back.
- `rotation` — same as the tag; `replaces_honeytoken_id` — the honeytoken this deployment
  replaced on a rotation (null for a first plant).
- `verify`, `remove` — plain-words instructions for the next agent or human: which connector
  call, which identifier, what to look for.

Later lifecycle events add their own notes (`RESET ...`, `ROTATED-TO ...`, `ROTATED-FROM ...`,
`REVOKED ...`). When the deployment changes (status, locator moved, re-pinned), update the
`GG-DEPLOYMENT` note in place with `PATCH .../notes/{note_id}` **if** its `api_token_id` matches
the current key — the API only lets a key edit its own notes — otherwise append a new
`GG-DEPLOYMENT` note. Readers always take the **newest** `GG-DEPLOYMENT` note
(`GET .../notes?ordering=-created_at`) as current; older ones are history.

## Reconcile

Reconcile is the read-only comparison that every other workflow starts from. It mirrors what
`ggshield honeytoken plant` does on a laptop — fetch desired state, compare with what is on disk,
derive `write` / `delete` actions — except that here the agent holds the desired state (the
registry) and reads the actual state from the source through its connector.

Per honeytoken:

1. **Server view** — `status` (`active` / `triggered` / `revoked`), `triggered_at`,
   `open_events_count`, system `tags` (`publicly_exposed`), and `/sources` for every surface:
   which sources and elements the scanner found the token in.
2. **Registry view** — the four tags and the newest `GG-DEPLOYMENT` note.
3. **Source view** — call the connector named by `surface` with the `locator` and search for
   `access_token_id`.

Derive one action and one reason:

| Server | Registry | Source | Action | Reason |
|---|---|---|---|---|
| active | present | found | *none* | **in place** |
| active | present | not found | `write` | **drifted** — artifact deleted, edited or moved; re-plant the same token at the same locator |
| active | `status: failed` or `pending` | not found | `write` | **unfinished** — the earlier plant did not land; retry the same token |
| active | missing | n/a | *ask* | **unregistered** — created outside this skill; ask where it lives and write the registry, or `revoke` if nobody can place it |
| triggered | any | any | *review* | **triggered** — run the triggered review before any action |
| revoked | present | found | `delete` | **stale** — a revoked key still sits in the source; remove it |
| revoked | present | not found, `status != removed` | *none* (set `removed`) | **cleaned** — confirm the registry |
| any | present | location gone (archived space, deleted channel, deleted repo) | `revoke` | **orphaned** — close the deployment with a `REVOKED` note |

`/sources` adds two verdicts of its own on every surface. A deployment with `status: planted`
that `/sources` still does not list after the source's next full scan is **not scanner-visible**:
the decoy sits in something the integration does not index (a canvas, an image, a binary), or the
source is outside the perimeter — move it to an indexed element and re-plant, or add the source.
And `/sources` listing more places than the registry knows (three repositories for one token, a
message forwarded to another channel) means the token was **copied or forked** — flag it, because
a trigger can no longer be attributed to one place. The host-API side of the check (commit reachable, branch or PR
still there, squash-merge erased a `history` placement) and the VCS-specific verdict table are in
`vcs-playbook.md`.

Applying the actions is a separate, confirmation-gated step (see `lifecycle-workflows.md`):
`write` goes through the plant steps with the existing token, `delete` through the clean-up
steps, and each outcome is reported back into the note's `status` (`planted` / `failed` /
`removed`) — the source-side equivalent of the endpoint's status PATCH.

## Rotation as reconcile actions

On endpoints, the server revokes the old honeytoken and the next reconcile returns `delete(old)`
and `write(new)`; the client applies both at once. Sources follow the same two actions but the
agent orders them to keep coverage: `write(new)` at the locator first, read back, then
`delete(old)` from the same artifact, read back, and only then revoke the old honeytoken. The new
deployment's note carries `replaces_honeytoken_id`; the old token gets a `ROTATED-TO` note and the
new one a `ROTATED-FROM` note. Full runbook in `lifecycle-workflows.md`.

## Legacy tokens

Tokens that pre-date the skill have no registry. Bootstrapping: list all active tokens, show the
name + description + `/sources`, and ask the user to fill in the surface and locator for each — or
decide to revoke the ones nobody can place. Write the registry as you go. Do this once; from then
on every plant carries its deployment record.
