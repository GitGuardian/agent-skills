---
name: triage-incidents
description: Use when triaging or reviewing GitGuardian secret incidents already detected in the dashboard, when asked what is leaking in the org or what to fix first, when remediating or rotating a credential flagged in an incident, after a Public Monitoring alert, or to assign, tag, or resolve incidents. Operates through the GitGuardian Developer MCP server.
metadata:
  version: "0.3.0" # x-release-please-version
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

- **Two non-interchangeable incident categories.** Internal incidents (integrated
  sources: private/org repos, Slack, Jira, registries) use `list_incidents` /
  `get_incident`. Public incidents (Public Monitoring on the worldwide perimeter:
  public GitHub, gists, Docker Hub) use `list_public_incidents` / `get_public_incident`.
  IDs are not interchangeable; an internal write tool called with a public ID silently
  404s. Default to internal unless the user's intent is about leaks "on public GitHub /
  outside the org / on Docker Hub / found by Public Monitoring".
- **Triage before action.** Rank the full set first; do not start remediating the first
  incident before the user has seen the prioritized list.
- **Read the doctrine before composing remediation.** When you are ready to drive a fix,
  read [`references/remediation-doctrine.md`](references/remediation-doctrine.md)
  end-to-end. Rotation-first; history-rewrite only under narrow conditions; public
  exposure is always burned.
- **Never auto-resolve.** Marking an incident RESOLVED / IGNORED, assigning it, or
  tagging it is an outward-facing state change on the shared dashboard. Confirm with the
  user before any write, and only mark RESOLVED after rotation is actually confirmed —
  never on intent.
- **HMSL stays user-run.** When a finding's validity is `unknown` / `no_checker` /
  `not_checked`, the follow-up is HasMySecretLeaked. Do not run `ggshield hmsl` yourself
  and do not read the credential into context — print the command for the user
  (`-n none --json`). If the `check-hmsl` skill is installed, load it for the full
  protocol.

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

## Best Practices

- Rank validity-first (valid > unknown > invalid-suppressed), then by `score`,
  `severity`, `source_criticality`, `public_exposure`.
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
