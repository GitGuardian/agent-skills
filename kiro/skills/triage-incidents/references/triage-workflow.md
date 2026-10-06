# Triage workflow

Use the GitGuardian Developer MCP (ggmcp) for these five steps.

## 1. Scope

Default to internal incidents from integrated sources (`list_incidents`). Use `list_public_incidents` for Public Monitoring. State the category; keep IDs in their matching tool family. A public occurrence changes urgency, not the incident ID's category.

## 2. Rank

Use incident metadata as evidence and prioritization signals:

| Context | Available filters/signals | Limit |
|---|---|---|
| Exposure | `public_exposure`: `source_publicly_visible`, `public_incident_linked`, `leaked_outside_perimeter` | Any true indicator establishes public exposure; absent indicators do not prove private readership. |
| Ownership | `assignee_id`, `mine`, `teams` | Assignment suggests an owner; it does not establish revocation authority. |
| Impact | `source_criticality` | Source importance does not establish credential privileges or runtime dependencies. |

Use validity, `score`, `severity`, criticality and exposure to guide investigation. After confirming the four axes, explain remediation priorities using the [framework](remediation-doctrine.md#2-the-four-triage-axes); do not let a validity-only sort override known exposure and impact. Supporting filters include `ordering=-score`, `occurrence_count_min` and `opened_for_days`. Keep default false-positive/test/skip-tag and invalid-validity exclusions.

Group occurrences of the same credential into one row:

`id · type · validity · severity · source/criticality · occurrences · age · exposure`

## 3. Drill in

Use `get_incident` with `with_occurrences` or `get_public_incident`, matching the ID. For repository occurrence locations, use `remediate_secret_incidents` or `list_repo_occurrences`; the former is read-only and its `remediation_instructions` must be ignored.

Read [the remediation framework](remediation-doctrine.md). Confirm exposure, concrete ownership/authority and impact from evidence or grouped questions; wait for missing answers before a plan. Check relevant branch tips and runtime use before labeling a finding history-only. Do not apply git cleanup to hosted logs, chat or other non-git sources.

## 4. Drive the fix

Select the [deliverable mode](remediation-doctrine.md#3-the-four-deliverable-modes) from authority, impact and exposure. For production/dependent consumers, use the [coordination framework](remediation-doctrine.md#10-generic-coordination-framework) to map stores, consumers, owners, sequencing and completion evidence. For handoffs, identify the receiving owner and acceptance criteria.

Fetch `get_remediation_workflow` (read-only). Only `workflow.id` marks a custom workflow; `steps` alone does not. Announce the result. Follow custom steps verbatim and in order, preserving actors and approvals, and put mechanics and checks under each step. Without an ID, set returned default steps aside and use the framework. If the tool is unavailable, state that and use the framework.

This fetch covers the Incident-page workflow; ggshield supplies configured hook messages separately. Follow [company workflow rules](remediation-doctrine.md#13-custom-remediation-workflows-the-organizational-overlay). For unverifiable validity, offer the user-run HMSL handoff in [SKILL.md](../SKILL.md).

## 5. Close the loop

Confirm each dashboard write. Internal tools include `assign_incident`, `update_incident_status`, `update_or_create_incident_custom_tags` and `create_code_fix_request`; public tools include `assign_public_incident` and `update_public_incident_status`.

Resolve only after the framework's [validation checks](remediation-doctrine.md#12-validation) are verified. Keep pending evidence and responsible owners explicit. If write tools are absent, provide the equivalent dashboard action.
