# Triage workflow

The five steps below run through the GitGuardian Developer MCP (ggmcp). Internal and
public incidents use separate tool families with non-interchangeable IDs.

## 1. Scope

- **Internal** (default): `list_internal_incidents`. Sources the workspace integrated — private/
  org repos, Slack, Jira, registries.
- **Public**: `list_public_incidents`. GitGuardian Public Monitoring on the worldwide
  public perimeter (public GitHub, gists, Docker Hub).

Pick one family per query and say which you used. Never pass a public incident ID to an
internal tool or vice versa — it returns a 404. When the user pastes an incident link or an
ID of unknown kind, call `get_gitguardian_resource` to open it and learn its kind.

## 2. Rank — the doctrine axes are server-side filters

The remediation doctrine's four triage axes map directly onto `list_internal_incidents` filters,
so prioritization is built from real data, not guessed:

| Doctrine axis | MCP filter |
|---|---|
| Detection context | Always post-leak — incidents are already detected. (The doctrine's pre-leak track does not apply here.) |
| Exposure (public vs internal-private) | `public_exposure`: `source_publicly_visible`, `public_incident_linked`, `leaked_outside_perimeter` |
| Ownership | `assignee_id` / `mine` / `teams` |
| Blast radius | `source_criticality`: `critical` … `unknown` |

Supporting signals: `ordering=-score` (0–100 priority score), `validity`
(`valid` > `unknown`/`no_checker`/`failed_to_check` > `invalid`), `severity`,
`occurrence_count_min`, `opened_for_days`. Defaults already exclude `FALSE_POSITIVE` /
`TEST_FILE` / `CHECK_RUN_SKIP_*` tags, `invalid` validity, `low` / `info` severity and
`IGNORED` status — keep those exclusions. Multi-value filters take lists. List tools return
`has_more` and `next_arguments`: call the tool again with `next_arguments` for the next
page, and do not present a partial page as the full set.

Surface a grouped, ranked table:

`id · secret type · validity · severity · source + criticality · occurrence count · age · exposure`

Collapse the same credential seen across multiple occurrences into a single row.

## 3. Drill in

- Use `get_internal_incident` for internal incident context, such as assignee and
  tags; pass `with_history` for its comments and status changes. Use
  `get_public_incident` for a public one. Use occurrence tools to investigate where the
  credential appears.
- Use `list_internal_incident_locations` for the places to remediate: the files that
  still hold the secret on each source's default branch, and the pull requests already
  opened to fix them. Keep the user's repository scope explicit, and do not assume the
  remote default branch is the currently checked-out branch.
- Use `list_internal_occurrences` with `incident_id` when the user wants every known
  occurrence of an internal incident. Preserve the requested scope across sources,
  branches, tags, statuses, severities, and validities: pass `[]` for `tags`,
  `exclude_tags`, `status`, `severity`, and `validity` to lift the default filters. Do
  not narrow an all-locations request to the current repository or default branch, or
  apply routine triage exclusions to it. For public incidents, use
  `list_public_occurrences`.
- Read the connected tool descriptions and schemas for parameters, defaults, pagination,
  and response semantics. Verify coverage against the requested scope before presenting
  the result as complete; an incident-detail snapshot is not evidence of full coverage.

## 4. Drive the fix

First, fetch the workspace's remediation workflow with `get_remediation_workflow`
(read-only, `incidents:read`). The response is wrapped under a `workflow` key. **Gate on
the presence of `workflow.id`, never on the existence of `steps`** — the default workflow
also ships a full `steps[]`, so steps prove nothing; only `id` marks a configured custom
workflow. **Announce which branch you took** before composing the deliverable:

- **Custom workflow (`workflow.id` present):** say so (e.g. *"returned `id: <n>` → custom
  workflow"*). The customer's ordered `steps[]` are the spine of your deliverable — render
  them as their own literal numbered list and nest the doctrine detail under each step; the
  triage axes calibrate how much detail. Follow
  [`remediation-doctrine.md` § 13](remediation-doctrine.md#13-custom-remediation-workflows-the-organizational-overlay)
  end-to-end.
- **Default workflow (no `workflow.id`) or tool absent:** say so (e.g. *"no `id` →
  GitGuardian default workflow"*), and do **not** call it "custom" or "configured by your
  workspace." **Set the returned default steps aside — do not render, quote, or use them as
  scaffolding** — and drive the remediation entirely from the doctrine: read
  [`remediation-doctrine.md`](remediation-doctrine.md) end-to-end and produce the
  deliverable mode it prescribes, exactly as if the tool had returned nothing. Note that this
  fetch reads only the Incident-page touchpoint; custom Pre-commit/Pre-push/Pre-receive
  messages surface via ggshield, not here.

Either way, these fill-ins hold — map each under the relevant customer step when a custom
workflow is present:

- **Rotation first.** A rotated credential is dead; that is what stops the attack.
- **HMSL for unverifiable validity.** `unknown` / `no_checker` / `failed_to_check` → hand the
  user a `ggshield hmsl check ... -n none --json` command to run themselves. Do not run
  it and do not read the credential into context.
- **History rewrite only under the narrow doctrine conditions** — not by default.
- **Public exposure = always burned.** The public track in the doctrine applies; rotate
  regardless of any history cleanup.

## 5. Close the loop (writes)

Confirmation-gated. Each tool makes one change to one incident kind:

| Change | Internal | Public |
|---|---|---|
| Assign / unassign | `assign_internal_incident`, `unassign_internal_incident` | `assign_public_incident`, `unassign_public_incident` |
| Resolve / ignore / reopen | `resolve_internal_incident`, `ignore_internal_incident`, `reopen_internal_incident` | `resolve_public_incident`, `ignore_public_incident`, `reopen_public_incident` |
| Tag (one tag per call) | `add_internal_incident_custom_tag`, `remove_internal_incident_custom_tag` | `add_public_incident_custom_tag`, `remove_public_incident_custom_tag` |
| Comment | `add_internal_incident_comment`, `edit_internal_incident_comment` | `add_public_incident_comment`, `edit_public_incident_comment` |
| Code fix (optional) | `create_internal_incident_code_fix_request`, with location IDs from `list_internal_incident_locations` | — |

A write result with `changed: false` means the incident was already in the requested
state.

Guards:
- **Confirm before every write.** Assignment, tagging, and status changes are
  outward-facing changes on the shared dashboard.
- **Only mark RESOLVED after rotation is confirmed** — never on intent.
- **Ask, never choose, the answers only the user has.** Resolving takes whether the
  secret was revoked (internal) or a resolve reason (public); ignoring takes an ignore
  reason. Ask the user for these values.
- If write tools are absent, the token lacks write scope — hand the user the dashboard
  action instead.
