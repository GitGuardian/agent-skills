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
- `remediate_secret_incidents` for exact file paths, line numbers, and git commands on
  code-resident occurrences. Use `list_repo_occurrences` for source-scoped enumeration.

## 4. Drive the fix

Read [`remediation-doctrine.md`](remediation-doctrine.md) (the slim core), then load the
relevant lifecycle track and credential-family file it points to, and produce the
deliverable mode it prescribes:

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
