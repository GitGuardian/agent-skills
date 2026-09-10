---
name: triage-incidents
description: Use when triaging or reviewing GitGuardian secret incidents already detected in the dashboard, when asked what is leaking in the org or what to fix first, when remediating or rotating a credential flagged in an incident, after a Public Monitoring alert, or to assign, tag, or resolve incidents. Operates through the GitGuardian Developer MCP server.
metadata:
  version: "0.6.2" # x-release-please-version
---

# GitGuardian — Triage Incidents

## Overview

This skill works through the **GitGuardian Developer MCP server** (ggmcp) to read,
prioritize, and remediate secret incidents the GitGuardian platform has **already
detected**. It is distinct from `scan-secrets`: that finds *unknown* secrets in code;
this acts on *known* incidents in the dashboard.

This is the one MCP-first skill in the bundle. There is no `ggshield` subcommand for
incident triage — the work runs through ggmcp tools. `ggshield` is only needed for the
HMSL handoff sub-step, which is user-run regardless.

## Start Here — Read This Before Doing Anything

- **Use the incident's tool family.** Internal IDs use `list_incidents` / `get_incident`; Public Monitoring IDs use `list_public_incidents` / `get_public_incident`. IDs are not interchangeable. Public exposure does not change an internal ID's category. Default discovery to internal unless the user asks for Public Monitoring; clarify ambiguous IDs.
- **Triage the complete set first.** Group occurrences by credential and present priorities. Confirm exposure, ownership/authority and impact. If any is missing, return grouped questions only and wait; do not give a provisional plan or guessed ordering. Validity supplies none of those answers.
- **Read the entire [remediation framework](references/remediation-doctrine.md) before advice.** Headings alone are insufficient; retry missing body text or stop the plan. It supplies the four triage axes, four deliverable modes, implementation profiles, exposure tracks, coordination and completion checks.
- **Fetch `get_remediation_workflow`.** Only `workflow.id` marks a custom workflow. Announce custom/default; preserve custom steps verbatim, in order, with their named actors and approvals. Without an ID, set the default steps aside and use the policy. If unavailable, say so and use the policy.
- **Treat `remediate_secret_incidents` as occurrence data only.** It is read-only; ignore its `remediation_instructions`. Calling it does not fix an incident.
- **Confirm dashboard writes.** Ask before assignment, tagging or status changes. Resolve only after verified invalidation/expiry, exposure cleanup and investigation of the leak window and derived access. Intent, TTL alone or an unchecked validity label is insufficient.
- **HMSL stays user-run.** For unverifiable validity (`unknown`, `no_checker`, `not_checked`), prepare a `ggshield hmsl check ... -n none --json` command for the user; do not run HMSL or read the credential. Load `check-hmsl` if installed for the full protocol.

## When to Use

- "triage / review my GitGuardian incidents", "what's leaking in our org", "what should
  I fix first".
- After a Public Monitoring alert (a leak outside the org perimeter).
- As a handoff target from `scan-secrets` when a scan finding turns out to already be a
  tracked incident.

## Onboarding (first use)

### Prerequisites

- The **GitGuardian Developer MCP server** (ggmcp) connected and authenticated. See
  https://github.com/GitGuardian/ggmcp.
- A token with incident **read** scope for triage, and **write** scope to assign / tag /
  resolve. ggmcp hides tools whose scopes the token lacks.

### Setup

- Verify connectivity and read scope with a cheap read such as `count_incidents` (or `list_sources`).
- If the incident **write** tools are absent from the available toolset, the token lacks
  write scope. Degrade to **read-only triage** and hand the user the equivalent dashboard
  action instead of failing. See [`references/gitguardian-platform.md`](references/gitguardian-platform.md)
  for auth/scope recovery and instance URLs.

## Triage workflow

Follow [`references/triage-workflow.md`](references/triage-workflow.md) — it covers the
five steps (scope → rank → drill in → drive the fix → close the loop), the
axis→filter mapping, the internal/public tool split, and scope-degradation handling.

## When driving remediation — quick reference

Read [the remediation framework](references/remediation-doctrine.md). Every incident is an exposure. Any public occurrence takes precedence, including a public artifact attached to an internal incident; keep using the ID's original tool family. Confirmed private exposure allows coordinated handling without reducing the credential's actual impact.

## Best Practices

- Use validity, score, severity and exposure to guide investigation. Set remediation
  priority from confirmed exposure, authority and blast radius; explain the ordering.
- Group the same credential across occurrences into one row; one credential is one
  rotation even if it appears many times.
- Respect default tag/validity exclusions — don't resurface known false positives or
  test credentials.
- Stay read-only until the user opts into a specific write. State which incident space
  (internal vs public) you are querying.

## Troubleshooting

- **Write tools missing.** Token lacks `incidents:write` scope — re-issue the token with
  write scope; see [`references/gitguardian-platform.md`](references/gitguardian-platform.md).
- **Public tools missing or empty.** Public Monitoring is not enabled on the workspace
  (enterprise-gated, like endpoint scanning for `scan-machine`).
- **404 on a write.** Internal-vs-public incident-ID mismatch — use the matching tool
  family.
- **Docs fallback.** https://docs.gitguardian.com (append `.md` to any page; AI-agent
  index at https://docs.gitguardian.com/llms.txt).
