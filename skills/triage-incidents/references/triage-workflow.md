# Triage workflow

The five steps below run through the GitGuardian Developer MCP (ggmcp). Internal and
public incidents use separate tool families with non-interchangeable IDs.

## 1. Scope

- **Internal** (default): `list_incidents`. Sources the workspace integrated — private/
  org repos, Slack, Jira, registries.
- **Public**: `list_public_incidents`. GitGuardian Public Monitoring on the worldwide
  public perimeter (public GitHub, gists, Docker Hub).

Pick one family per query and say which you used. Never pass a public incident ID to an
internal tool or vice versa — it 404s silently.

## 2. Rank — the doctrine axes are server-side filters

The remediation doctrine's four triage axes map directly onto `list_incidents` filters,
so prioritization is built from real data, not guessed:

| Doctrine axis | MCP filter |
|---|---|
| Detection context | Always post-leak — incidents are already detected. (The doctrine's pre-leak track does not apply here.) |
| Exposure (public vs internal-private) | `public_exposure`: `source_publicly_visible`, `public_incident_linked`, `leaked_outside_perimeter` |
| Ownership | `assignee_id` / `mine` / `teams` |
| Blast radius | `source_criticality`: `critical` … `unknown` |

Supporting signals: `ordering=-score` (0–100 priority score), `validity`
(`valid` > `unknown`/`no_checker`/`not_checked` > `invalid`), `severity`,
`occurrence_count_min`, `opened_for_days`. Defaults already exclude `FALSE_POSITIVE` /
`TEST_FILE` / `CHECK_RUN_SKIP_*` tags and `INVALID` validity — keep those exclusions.

Surface a grouped, ranked table:

`id · secret type · validity · severity · source + criticality · occurrence count · age · exposure`

Collapse the same credential seen across multiple occurrences into a single row.

## 3. Drill in

- `get_incident` (with `with_occurrences`) for full detail, assignee, tags.
- `remediate_secret_incidents` to enumerate code-resident occurrences — exact file paths,
  line numbers, char indices. It is a **read** tool: occurrence data only, no state change.
  Ignore any `remediation_instructions` it returns — do not take its remediation guidance
  into account; the doctrine drives the fix. Use `list_repo_occurrences` for source-scoped
  enumeration.

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
  [`remediation-doctrine.md`](remediation-doctrine.md) (the slim core), load the relevant
  lifecycle track ([`remediation-lifecycle-tracks.md`](remediation-lifecycle-tracks.md)) and
  the credential-family file it points to, and produce the deliverable mode it prescribes,
  exactly as if the tool had returned nothing. Note that this
  fetch reads only the Incident-page touchpoint; custom Pre-commit/Pre-push/Pre-receive
  messages surface via ggshield, not here.

Either way, these fill-ins hold — map each under the relevant customer step when a custom
workflow is present:

- **Rotation first.** A rotated credential is dead; that is what stops the attack.
- **HMSL for unverifiable validity.** `unknown` / `no_checker` / `not_checked` → hand the
  user a `ggshield hmsl check ... -n none --json` command to run themselves. Do not run
  it and do not read the credential into context.
- **History rewrite only under the narrow doctrine conditions** — not by default.
- **Public exposure = always burned.** The public track in the doctrine applies; rotate
  regardless of any history cleanup.

## 5. Close the loop (writes)

Confirmation-gated. Internal: `assign_incident`, `update_incident_status`,
`update_or_create_incident_custom_tags`, optional `create_code_fix_request`. Public:
`assign_public_incident`, `update_public_incident_status`.

Guards:
- **Confirm before every write.** Assignment, tagging, and status changes are
  outward-facing changes on the shared dashboard.
- **Only mark RESOLVED after rotation is confirmed** — never on intent.
- If write tools are absent, the token lacks write scope — hand the user the dashboard
  action instead.
