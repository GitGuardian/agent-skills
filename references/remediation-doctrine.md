# GitGuardian Remediation Doctrine

> **Status:** draft (pre-1.0)
> **Audience:** any GitGuardian agent or human building a remediation flow — open-source agent skills, in-app agent, internal tooling, security teams.
> **Scope:** what to do when a leaked credential is found. Agent-side companion to the customer-facing IR guidance on docs.gitguardian.com.

When a credential is found leaking, the agent's first job is not to act — it is to know enough to act well. This doctrine prescribes what the agent must know before producing a deliverable, what shapes a deliverable can take, and how to dispatch across the lifecycle stages where a leaked credential can be discovered. The same logic drives every GitGuardian agent: the open-source skills shipped from this repo, the in-app agent inside the GitGuardian product, and future profiles (SecOps integrations, autonomous remediation).

## Contents

1. [Principles](#1-principles)
2. [The four triage axes](#2-the-four-triage-axes)
3. [The four deliverable modes](#3-the-four-deliverable-modes)
4. [Implementation profiles](#4-implementation-profiles)
5. [Pre-leak track](#5-pre-leak-track)
6. [Post-leak / public-facing track](#6-post-leak--public-facing-track)
7. [Post-leak / internal-private track](#7-post-leak--internal-private-track)
8. [Off-repo exposure track](#8-off-repo-exposure-track)
9. [Per-secret-type appendix](#9-per-secret-type-appendix)
10. [Generic coordination framework](#10-generic-coordination-framework)
11. [Public-leak takedown / reporting](#11-public-leak-takedown--reporting)
12. [Validation](#12-validation)

## 1. Principles

These claims are load-bearing. Every later section is downstream of one or more of them; the architectural choices in §§ 2–4 are direct consequences.

1. **Rotation is necessary but not sufficient.** A rotated credential is dead — that is what stops the attack. But the *cost* of getting from "credential is live in production" to "credential is rotated" is rarely a click. Coordination across systems, owners, and change-management processes can dwarf the technical rotation step. The agent's job is to acknowledge this cost, not paper over it.

2. **Public vs internal-private exposure are different incident types** — not different urgencies of the same incident. A public leak is scraped within minutes; the credential is burned regardless of what the developer does next. An internal-private leak has a finite, auditable set of cloners; force-pushing a fix is sometimes the right call. The history-rewrite playbook applies to one; the scrape-window framing applies to the other. Collapsing them produces wrong advice for at least one of the two.

3. **The agent's first job is triage, not action.** Driver mode (walking the user through revoke / regenerate / update-callers) is opt-in. The agent always asks who owns the credential and what it unlocks before assuming it can drive a rotation that may not be the developer's to drive. Honest "you don't own this, file a ticket with X" beats wrong "click this button now."

4. **Blast radius is orthogonal to exposure.** A credential leaked publicly might be a throwaway sandbox key (one click). A credential leaked only in a private repo might unlock production payment infrastructure (multi-team migration). The "where it leaked" question and the "what it unlocks" question both matter; one does not substitute for the other.

5. **History rewrite rarely earns its complexity publicly; sometimes it does privately with audited clones.** In public repos, mirrors / archives / caches / search indexes already hold the credential. Rewriting history forces a break across every consumer with no recovery benefit. In private repos with a finite known set of cloners, force-pushing + coordinated re-clone is viable when policy demands it.

6. **Friction is preferable to false confidence.** Three triage questions are more friction than one. The agent asks all three anyway, because the four deliverable shapes (§ 3) are materially different and using the wrong shape produces wrong advice. Friction is recoverable; wrong advice that the user follows is not.

### How the agent talks to the user

This doctrine is the agent's reference; the agent's output to the user is not. Someone resolving a leaked credential needs to know **what to do next**, not why the doctrine is structured this way.

Apply these rules to every user-facing message:

- **Lead with the next action.** First line is what the user should do right now (or the next question the agent needs answered to know what to do).
- **Cap the default response at ~10 lines.** If a deliverable runs longer without the user asking for detail, you're using the wrong shape — switch to bullets, a table, or a one-line summary plus "ask if you want the full walkthrough."
- **Defer details to explicit asks.** The doctrine contains the rationale, the alternatives, the history-rewrite caveats, the per-type runbook fine print. Surface them only when the user asks "why?" or "what about X?".
- **One question at a time.** When asking the user a triage question (ownership / exposure / blast radius), ask one, wait, then dispatch — not all three at once.
- **No prose walls.** Headings, bullets, and tables over paragraphs. Inline rationale only when it changes the action.

The doctrine itself stays comprehensive. The agent's output stays tight.

### Where remediation content comes from

Three sources, consulted in this priority order. Don't skip a level.

1. **The skill / doctrine itself.** This document and the per-skill `SKILL.md` files prescribe the *framework* (triage axes, deliverable modes, lifecycle tracks) and provide the *structural* remediation content (per-secret-type appendix in § 9, coordination framework in § 10, principles in § 1). Start here. Every finding goes through the triage flow first.

2. **`remediate_secret_incidents`** on the GitGuardian Developer MCP server (bundled with this plugin's `.mcp.json`). Call it with the source's `source_id` — use `find_current_source_id` if not already known. Returns concrete remediation for the specific incident: exact file paths, line numbers, character offsets, git commands to fix history, `.env` / `.env.example` scaffolding, rotation guidance from GitGuardian's actual remediation knowledge. Use it to **fill in the doctrine's structure with workspace-specific details** that training data cannot reconstruct. When MCP and the doctrine agree on something (e.g., AWS access-key revoke flow), prefer the MCP-provided wording — it ages with the platform.

3. **General vendor knowledge.** Last resort. Use only when both the doctrine and the MCP are silent on a specific question. Verify against current vendor docs before recommending steps — vendor consoles drift faster than training data.

**The agent's default training data is the lowest-priority source.** If the agent finds itself writing rotation steps from general knowledge without first consulting the doctrine *and* attempting the MCP path, it has skipped the more reliable sources. Stop, back up, consult them in order.

The priority is not always sequential — for an off-repo `scan-machine` finding there's no `source_id`, so the MCP path is inapplicable and the agent falls straight from the doctrine to general knowledge for the specific scrub commands. That's fine; the rule is *consult in order, stop when answered*, not "always call MCP."

## 2. The four triage axes

The agent must know all four axes before producing a deliverable. Three of them require user input in context-poor implementations; higher-context implementations may answer some from data (see [Implementation profiles](#4-implementation-profiles)).

| Axis | Range | Default acquisition |
|---|---|---|
| Detection context | pre-leak (file-edit / pre-commit / pre-push) · post-leak · off-repo | Free — the agent knows which hook fired or which command produced the finding |
| Exposure | public-facing · internal-private | Asked, or derived from repo URL when reliable |
| Ownership | the developer has rotation authority · another team owns it | Asked |
| Blast radius | sandbox · shared dev · production-critical | Asked |

### Why three questions, not one

Collapsing exposure / ownership / blast radius into a single "can you just do this?" question loses information needed to produce the right escalation artifact. "You don't own this" produces a *ticket template addressed to the owning team*. "You own it but it's coupled to production" produces a *rotation runbook with dependency-mapping and a change-ticket draft*. Same answer to "can you just do this?" (no), entirely different deliverables. The agent asks all three, once per finding, before dispatching.

### Detection context is free

The agent always knows which hook fired or which command produced the finding. It never needs to ask the user to classify the lifecycle stage. Pre-leak / post-leak / off-repo dispatch is mechanical (see [Tracks](#5-pre-leak-track) onward).

## 3. The four deliverable modes

The cross-product of ownership × blast radius produces four distinct deliverable shapes. Public exposure escalates the worst case into containment.

| Mode | Triggered by | Deliverable |
|---|---|---|
| **Driver** | own + sandbox or shared-dev blast (any exposure) | Per-secret-type walkthrough: revoke → regenerate → update-callers → verify. Conventional runbook. See [§ 9](#9-per-secret-type-appendix). |
| **Coordination** | own + production blast | Rotation runbook starting with a **dependency-mapping step**: enumerate consumers, plan a sequenced rollout, draft the change ticket. Not "click this now" — "treat this as a small project." Uses the framework in [§ 10](#10-generic-coordination-framework). |
| **Escalation** | corp-owned (any blast / any exposure) | Ticket template (incident type, exposure timeline, files affected, what's known about ownership) addressed to the owning team. The agent's job is handoff, not execution. |
| **Containment** | corp-owned + production blast + **public** exposure | The worst case. **Explicit branch up front:** *does your org have a security on-call rotation or IR team?* Yes → handoff template + step back. No → self-driven IR checklist (treat credential as burned, hunt for anomalous usage in service logs, document the exposure timeline, escalate to leadership). |

### Parallel action: public-leak takedown

Whenever exposure is public-facing, the agent surfaces GitGuardian's takedown / public-source reporting path as a parallel action, independent of which deliverable mode is producing the main artifact. **Takedown does not replace rotation** — the credential is already burned. Takedown slows secondary scrapes (search engines de-index, archive sites are notified) and creates an audit trail. See [§ 11](#11-public-leak-takedown--reporting).

### One finding → one mode

The four modes do not stack. Every finding produces exactly one main deliverable (driver, coordination, escalation, or containment) plus, when public, the parallel takedown surfacing. The triage answers in § 2 select the mode; they do not combine into a richer hybrid.

## 4. Implementation profiles

The doctrine is the universal contract; profiles describe how each implementation honors it. A new implementation adds a column.

| Axis | Open-source agent skill (this repo) | In-app agent (GitGuardian product) | Future profile |
|---|---|---|---|
| Detection context | Hook that fired (free) | Incident metadata (free) | TBD |
| Exposure | Asked, or derived from repo URL | Source type from incident (`public_github`, `private_github`, …) | TBD |
| Ownership | Asked | Best-guess from workspace member/team data, confirmed with the user | TBD |
| Blast radius | Asked | Asked, or inferred from secret type + service tier | TBD |
| Concrete content (file/line/git/.env) | **Developer MCP** `remediate_secret_incidents` when `source_id` is known; per-type appendix when not | Same MCP path, plus workspace-internal APIs for richer context | TBD |

### Open-source agent skill

The implementation lives at `skills/scan-secrets/`, `skills/check-hmsl/`, future `skills/scan-machine/`, distributed via this repo's marketplace plugin. The agent's only free signal is which hook fired. Every other triage axis is asked of the user, in a single triage step before any deliverable is produced. The doctrine prescribes one canonical phrasing for each question, which each skill may adapt to its detection context.

For concrete remediation content, the open-source agent has the **GitGuardian Developer MCP server bundled** via this plugin's `.mcp.json`. The agent should call `remediate_secret_incidents` (using `find_current_source_id` to resolve a `source_id` if not already known) to layer workspace-specific file/line/git/`.env` content on top of the doctrine's structural advice — see *Where remediation content comes from* in § 1.

### In-app agent

The implementation lives inside the GitGuardian product. The agent has workspace context: incident metadata (source type, validity, first-seen / last-seen timestamps), member and team data, past remediation patterns in the same workspace, and links to the underlying git host. The detection context and exposure axes are answered from incident metadata. Ownership is best-guessed from workspace data and confirmed with the user (the agent always offers the user an out, never assumes). Blast radius remains asked, since neither incident metadata nor workspace membership reliably encodes "this credential opens production-critical systems."

### Future profiles

Reserved for implementations with richer context: SecOps integrations (RBAC from identity provider, CMDB / service-catalog data for automated dependency mapping), autonomous remediation flows, or industry-specific tooling. Each new profile adds a column with no doctrine changes — the contract is the four axes, not how they get filled in.

## 5. Pre-leak track

The credential is still on the developer's machine. No external system has the secret; rotation is not required. The deliverable is "remove it from the artifact it's about to enter, before that artifact propagates."

The pre-leak track dispatches by which hook fired:

### 5.1 Agent file-edit hook fired

The credential is in an unsaved buffer or just-saved file. It has not entered any git object. The agent reports the finding (file, line, secret type) and offers two paths:

1. **Undo the edit.** Revert to the prior file content. Appropriate when the credential was introduced accidentally by the agent itself.
2. **Refactor to a credential reference.** Replace the inline value with an environment variable, secrets-manager reference, or platform-native equivalent. Show the before/after.

Re-scan after the fix (`ggshield secret scan path <file> --json`) and only proceed once clean.

### 5.2 Pre-commit hook fired

The credential is staged and about to enter a git commit. The agent blocks the commit, reports the finding, and offers:

1. **Unstage the change containing the secret** (`git restore --staged <file>`), then fix in place as in § 5.1.
2. **If the commit message has already been written**, preserve it for re-use after the fix.

Re-scan; recommit only once clean.

### 5.3 Pre-push hook fired

The credential is in one or more local commits about to leave the machine. This is the last moment the secret can be removed without a rotation event.

1. **Most recent commit only** — fix the file, then `git add <file> && git commit --amend --no-edit`.
2. **Earlier commits in the unpushed range** — interactive rebase (`git rebase -i <base>`). Edit out, fixup, or squash the offending commits.
3. **After either rewrite**, re-scan the full repo (`ggshield secret scan repo . --json`). Push only once clean.

### Why no triage axes here

The credential has not been exposed. Ownership and blast radius are moot — rotation is not on the table. Detection context alone determines the deliverable. If the agent or the user is *unsure whether the secret has already been pushed* (e.g., the user can't remember, or this finding came from a routine repo scan rather than a hook), dispatch to the post-leak track instead. When in doubt, assume the secret has propagated.

## 6. Post-leak / public-facing track

The credential has been observed on a public artifact — public GitHub repository, public commit, public gist, HMSL match against the public-leak corpus, or any other source accessible to anyone with internet access. **The credential is burned.** Treat as compromised from the moment of first public exposure.

### The scrape window

Public GitHub is scraped continuously by bots looking for credentials. The window between commit and scrape is typically minutes, not hours. By the time the agent surfaces the finding, the credential should be assumed to have been collected by at least one party with no relationship to the developer or the owning organization. Rotation prevents further damage, but does not undo the exposure.

### History rewrite: don't bother

Force-pushing a history rewrite (BFG, `git filter-repo`) on a public repo:

- Does not retrieve the credential from mirrors, forks, archive sites, search indexes, or CI artifacts — all of which keep their own copies.
- Breaks every fork, clone, and open pull request, forcing coordinated re-clones for everyone with access.
- Buys nothing the rotation hasn't already bought.

The rotated credential is dead — that is what stops the attack. Scrubbing history on top is cosmetic and high-coordination. *Exception:* regulatory or contractual data-deletion obligations may force the rewrite anyway; do it *after* rotation, with explicit buy-in from collaborators, and with full acknowledgment that mirrors / forks / caches remain out of reach.

### Triage flow

Run the three axes (exposure is already answered: public-facing):

1. **Ownership** — does the developer have authority to revoke this credential right now?
2. **Blast radius** — sandbox / shared dev / production-critical?

Dispatch to the deliverable mode:

| Ownership | Blast | Mode |
|---|---|---|
| Own | Sandbox or shared dev | Driver |
| Own | Production-critical | Coordination |
| Corp-owned | Sandbox or shared dev | Escalation |
| Corp-owned | Production-critical | **Containment** |

In every cell, surface the public-leak takedown action (see [§ 11](#11-public-leak-takedown--reporting)) as parallel — it does not replace rotation, but it slows secondary scrapes and creates an audit trail.

## 7. Post-leak / internal-private track

The credential is on an internal git host (private GitHub, GitLab, Bitbucket, Gitea, internal mirror) accessible only to organization members. **Rotation is usually required by security policy**, but urgency and history-rewrite viability differ materially from the public-facing track.

### The spectrum within "private"

"Private" is not a binary. Before assuming the internal-private playbook applies, the agent walks the user through a short read-path checklist:

- Does the repo have **third-party integrations** with read access? (Dependabot, Renovate, Copilot indexing, code-search appliances, security scanners, CI providers that mirror the repo.)
- Does the repo get **backed up or mirrored** to an external system? (Cloud backup vendor, archival service, disaster-recovery mirror in a different jurisdiction.)
- Is the **set of cloners auditable**? A repo with 8 humans and no automation is closer to "no leak." A repo with broad org-member access plus the integrations above blurs into the public-facing track.

If any of the above produces a "yes" that the user can't confidently constrain, **dispatch to the public-facing track instead.** The read-path is too wide to treat as private.

### History rewrite: viable, but coordinated

In a truly auditable private repo, force-push + coordinated re-clone is a real option:

1. **Inventory clones** — `git log --all` on the server, plus any known forks. List the set of machines that have fetched the repo.
2. **Rotate first** (always — see triage flow below). Don't rely on the rewrite to stop the attack.
3. **Rewrite** — BFG Repo Cleaner for large repos, `git filter-repo` for surgical removal.
4. **Force-push** to the canonical branch(es).
5. **Notify cloners** — each human re-clones (or carefully rebases) within an agreed window.
6. **Verify** — re-scan the repo (`ggshield secret scan repo . --json`); the secret should no longer appear in any commit.

Step 1 is the load-bearing one. If the cloner set isn't really auditable, you're in the public-facing track.

### Triage flow

Exposure is already answered: internal-private. Ask the remaining two axes:

1. **Ownership** — does the developer have authority to revoke this credential right now?
2. **Blast radius** — sandbox / shared dev / production-critical?

Dispatch:

| Ownership | Blast | Mode |
|---|---|---|
| Own | Sandbox or shared dev | Driver |
| Own | Production-critical | Coordination |
| Corp-owned | Sandbox or shared dev | Escalation |
| Corp-owned | Production-critical | Escalation (not Containment — see below) |

### Why not Containment in the internal-private track

Containment mode is reserved for the public + corp + production worst case, where the credential is provably out and the developer is provably not the right responder. In the internal-private track, the credential is on a finite, auditable surface — Escalation is the right mode even for production-critical corp-owned secrets, because there's a path to actually fix the underlying exposure (rotation + history rewrite + clone audit) that doesn't exist publicly. The owning team can drive the full remediation; containment-style triage is over-escalation.

If the read-path checklist above flips this finding into the public-facing track, the worst case re-becomes Containment there.

## 8. Off-repo exposure track

The credential sits on a developer machine outside git: dotfiles, shell history (`.bash_history`, `.zsh_history`), cloud CLI configs (`~/.aws/credentials`, `~/.kube/config`, `gcloud` defaults), agent caches, abandoned project trees in `~/Downloads` or `~/tmp`. This is `scan-machine` territory. **Not a "leak" in the git sense** — the secret has not propagated through commit / push / repo-clone — but it remains exfiltrable through other paths.

### Exfiltration model

The exposure surface is different from a repo leak. Risk paths include:

- **Local disk access by an attacker** with workstation-level compromise (malware, lost laptop, insider).
- **Backup vendors** that snapshot the developer's home directory to a third party (corporate iCloud / OneDrive / Dropbox, automatic backup tools).
- **Shared dev environments** where "the machine" isn't a single workstation — Codespaces, dev containers, cloud IDEs, jump hosts. The credential may already be visible to whoever administers the shared infrastructure.
- **Future scanning** by automation that traverses the file system, including future invocations of the agent itself.

### Triage flow

Detection context is `scan-machine` and is free. The other axes are reframed for the off-repo context:

1. **Exposure** — asked, but with a different surface. *"Is this machine personally owned, corp-issued, or a shared environment (Codespaces, dev container, jump host)? Is anything in your home directory backed up to an external service?"* Answers map to the same public-facing / internal-private split, with shared environments and external backup tipping toward the public-facing playbook because the read-path widens past the developer.
2. **Ownership** — same axis as the post-leak tracks: does the developer have authority to revoke this credential?
3. **Blast radius** — same axis.

Dispatch follows the same mode-selection table as the post-leak tracks based on the answers. Public-leak takedown does not apply (no public artifact to take down), but the *behavioral* containment-mode checklist (treat credential as burned, hunt for anomalous usage, document the exposure timeline) is appropriate when the answers land there.

### Remediation in addition to rotation

For the off-repo track, the agent also surfaces "remove the credential from the off-repo location it was found" — delete the file, edit the dotfile, scrub the shell history entry. This is independent of rotation and applies regardless of mode. The doctrine does *not* specify the per-location scrub commands here (they vary by shell, OS, and backup vendor); the `scan-machine` skill carries the dispatch.

## 9. Per-secret-type appendix

This appendix is the only section that's mostly invariant across implementations — rotating an AWS key is the same job whether the in-app agent or the open-source skill drives it. The doctrine ships a schema for any secret type, plus worked examples that calibrate what a good entry looks like.

**Use alongside `remediate_secret_incidents`, not instead of it.** The appendix is the *structural* pattern: what to revoke, where to revoke it, what consumers to update, how to verify. When a `source_id` is available, the MCP tool fills in the *concrete* details for the workspace's specific incident — exact file paths and lines, suggested git commands, `.env` scaffolding. Use the appendix when no `source_id` is available (off-repo findings, local pre-leak files), or to interpret and extend what the MCP returns. See § 1's *Where remediation content comes from* for the full priority order.

**v1 scope.** Schema + one worked example (AWS access keys). The remaining nine planned examples (GitHub personal access tokens, generic API keys, database connection URLs, private keys, Stripe API keys, Slack incoming webhooks, GCP service account JSON, Azure connection strings, OAuth refresh tokens) are deferred to a follow-up; until they land, the schema in § 9.0 is the template the implementing agent specializes from vendor documentation for those types.

### 9.0 Schema

Every per-type entry contains the same six fields, in the same order. The schema is the template for any secret type not yet worked out below: the implementing agent fills it using vendor documentation and its own context.

| Field | Content |
|---|---|
| **What it is** | One sentence: what the credential authorizes and where it's typically issued. |
| **Revoke location** | The exact navigation path in the issuing vendor's console (or API call) to deactivate / invalidate the credential. |
| **Regenerate location** | Where a new credential is created. Often (not always) the same console page. |
| **Common consumers** | Where this credential type is typically wired in: env vars, secrets-manager entries, CI configs, IaC files, dotfiles. Used by [Driver mode](#3-the-four-deliverable-modes). |
| **Dependency mapping for this type** | Specialization of [§ 10 steps 2–3](#10-generic-coordination-framework) for this credential type. Concrete commands and reports for finding consumers and their owners. Used by [Coordination mode](#3-the-four-deliverable-modes). |
| **Post-rotation verification** | How to confirm the old credential is dead and the new one works. Service-specific check + a generic re-scan. |

When applying the schema to a credential type without a worked entry below, the agent verifies vendor specifics against current docs at the moment of use rather than relying on training data — vendor consoles drift faster than this doctrine does.

### 9.1 AWS access keys

**What it is.** An access-key-ID + secret-access-key pair issued to an IAM user. Authenticates AWS SDK / CLI / API calls against the IAM principal's attached policies. Format: a 20-character key ID beginning with `AKIA` plus a 40-character secret. (Root account access keys exist but should never be created — see AWS's published best practices on long-term credentials.)

**Revoke location.** AWS Console → **IAM** → **Users** → *username* → **Security credentials** tab → **Access keys** section → set the leaked key to **Inactive**, then **Delete** once you've confirmed no consumer still uses it. CLI equivalent:

```bash
# Deactivate (immediately stops the key from authenticating; reversible)
aws iam update-access-key --access-key-id AKIA... --status Inactive --user-name <user>

# Delete (irreversible; do after dependency mapping confirms no consumer uses it)
aws iam delete-access-key --access-key-id AKIA... --user-name <user>
```

Canonical reference: [Manage access keys for IAM users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).

**Regenerate location.** Same Security credentials tab → **Create access key**. IAM users can hold a maximum of two access keys simultaneously per AWS's own limit, which is the overlap mechanism for graceful rotation: create the new one, roll consumers onto it, deactivate the old one, verify, delete the old one. CLI:

```bash
aws iam create-access-key --user-name <user>
```

**Common consumers.**

- `~/.aws/credentials` and `~/.aws/config` on developer / build / CI machines
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) on services, Lambda functions, ECS task definitions, EC2 user-data, Kubernetes secrets, container orchestrator configs
- CI provider secrets (GitHub Actions secrets, GitLab CI variables, CircleCI contexts)
- IaC files — Terraform `aws_iam_access_key` resources, Pulumi equivalents (note that committing keys via IaC is itself a finding)
- Third-party SaaS integrations configured with the IAM user's keys (CI/CD, monitoring, backup vendors, observability platforms)

**Dependency mapping for this type.**

1. **Pull the IAM credential report** to see when and where the leaked key was last used:

   ```bash
   aws iam generate-credential-report
   aws iam get-credential-report --query 'Content' --output text | base64 --decode
   ```

   The report shows `access_key_1_last_used_date`, `access_key_1_last_used_service`, and `access_key_1_last_used_region` per user. Same for `access_key_2_*`. Used services scoped to the leaked key give the first cut of the consumer list.

2. **Query CloudTrail** for the access key ID over the relevant exposure window:

   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA... \
     --max-results 50
   ```

   Each event includes `sourceIPAddress`, `userAgent`, `eventName`, and `eventSource` — the IPs and services that authenticated with the credential. Cross-reference unexpected IPs against your known consumer locations; anomalies suggest abuse.

3. **Grep the org's repos** for the access key ID and the canonical env-var names. Both are sufficient — the access key ID is itself a search term, and consumer code often references the env-var names rather than the value:

   ```bash
   # If you use ggshield, this is the same scan that found the leak; broaden it across the org
   ggshield secret scan repo <org-repo> --json | jq '.results[] | select(.policy_breaks[].matches[].match | contains("AKIA..."))'
   # Plus generic grep across org repos
   grep -rn 'AWS_ACCESS_KEY_ID\|AKIA' .
   ```

4. **List Lambda function configurations** for env-var consumers:

   ```bash
   aws lambda list-functions --query 'Functions[].FunctionName' --output text \
     | tr '\t' '\n' \
     | xargs -I{} aws lambda get-function-configuration --function-name {} \
       --query '{Name:FunctionName, Env:Environment.Variables}' --output json
   ```

5. **Inventory ECS task definitions, EC2 user-data templates, and CloudFormation/Terraform state** for any `AWS_ACCESS_KEY_ID` references. CodeBuild project environments and SageMaker domain configs are easy to miss.

6. **Check each CI provider's secrets configuration.** GitHub Actions: `gh secret list` per repo, repeated across the org. GitLab CI: `glab` or the API. CircleCI / Jenkins / Buildkite: their respective UIs or APIs.

7. **Inventory third-party integrations** in the AWS account that may have been configured with these keys — Datadog, New Relic, PagerDuty, Snyk, monitoring agents, backup vendors. AWS's IAM Access Analyzer can surface unfamiliar principals using the credential.

Map consumers from steps 1–7 to owning teams. Each owner gets a wave in the rollout sequence per the coordination framework's step 5 ([§ 10](#10-generic-coordination-framework)).

**Post-rotation verification.**

- Confirm the old key is *Deleted* (not just *Inactive*) in the IAM console or via `aws iam list-access-keys --user-name <user>`.
- Issue a deliberate AWS API call using the old key and expect failure:

  ```bash
  AWS_ACCESS_KEY_ID=<old-id> AWS_SECRET_ACCESS_KEY=<old-secret> aws sts get-caller-identity
  # Expected: InvalidClientTokenId error
  ```

- Re-scan the affected artifacts: `ggshield secret scan path <files> --json`.
- Spot-check CloudTrail for `errorCode: InvalidAccessKeyId` or `errorCode: AccessDenied` events using the old access key ID for 24h after rotation completes — these surface consumers that were missed in the dependency map.

### 9.2 – 9.10 Deferred (follow-up)

The following types are planned for a future revision of the doctrine. Until they land, apply the schema in § 9.0 from current vendor documentation:

- GitHub personal access tokens (classic and fine-grained)
- Generic API keys (schema applied with no vendor-specific shortcuts)
- Database connection URLs (PostgreSQL / MySQL / MongoDB / Redis)
- Private keys (RSA / EC / SSH)
- Stripe API keys (live and test)
- Slack incoming webhooks
- GCP service account JSON keys
- Azure connection strings (Storage, Service Bus, Event Hubs)
- OAuth refresh tokens

## 10. Generic coordination framework

Used by [Coordination mode](#3-the-four-deliverable-modes) (own + production blast) to structure the rotation as a project rather than a click. Each per-type worked example in [§ 9](#9-per-secret-type-appendix) specializes steps 2–3 of this framework into concrete commands for that secret type.

### The six steps

1. **Enumerate stores.** Where is this credential value held today? Env vars on running services, secrets-manager entries (Vault, AWS Secrets Manager, GCP Secret Manager, 1Password), config files in deployed artifacts, CI provider variables (GitHub Actions secrets, GitLab CI variables, CircleCI contexts), IaC files (Terraform, Pulumi), shared developer dotfiles. The store list determines what needs to be updated; an unknown store left in place after rotation re-introduces the breakage you're trying to avoid.

2. **Enumerate consumers.** Which running services, scheduled jobs, pipelines, dashboards, monitoring, or human workflows read this credential at runtime? This is the "blast radius made concrete" step. A consumer the agent doesn't know about is a consumer that will break when the credential rotates. Sources: service catalogs, CMDB, the IAM provider's "last used" reports (for cloud creds), grep across the org's repos, ask each likely owning team.

3. **Identify owners.** For each consumer in step 2, who owns the system that uses the credential? Names + team + on-call rotation. The rotation is a coordinated migration across these owners; without their buy-in and timing, the rotation is a partial cut.

4. **Check overlap support.** Does the credential type allow *concurrent* old + new credentials during cutover, or does the new credential immediately invalidate the old? Answer determines rollout strategy. Examples: AWS access keys allow two active per user (overlap → graceful rollout); some database password schemes do not (no overlap → coordinated cut at a specific moment).

5. **Sequence the rollout.** Non-production first → smoke-test → production in waves grouped by deploy cadence and ownership. If the credential type supports overlap, run old and new in parallel through the wave; if not, schedule a maintenance window and coordinate cut-and-validate. Owners from step 3 execute their wave; the agent (or the user) tracks completion.

6. **Draft the change ticket.** Pre-fill a ticket the user can paste into their tracking system (Jira, ServiceNow, Linear, internal change-request tooling). Required fields: exposure timeline, scope (which credential, which consumers), plan (the sequenced rollout), rollback strategy, validation (how to confirm the old credential is dead), approvers. The doctrine does not specify a ticket schema — orgs differ; the agent generates a template the user adapts.

### Where the framework is silent

Two things the framework deliberately does *not* prescribe:

- **Comms.** Telling the org "we're rotating credential X at time Y" is org-specific. The agent surfaces "comms needed" as a checklist item; the user owns the channel, audience, and tone.
- **Post-incident review.** The framework drives rotation, not learning. PIR is downstream; depends on org maturity. The agent flags it as a follow-up where appropriate.

## 11. Public-leak takedown / reporting

When exposure is public-facing, the agent surfaces takedown as a **parallel action** alongside the main deliverable. Takedown does not replace rotation; the credential is already burned. What takedown buys:

- **Slowed secondary scrapes.** Once the host removes the artifact, search engines de-index over hours-to-days; archive sites that honor removal requests follow.
- **Audit trail.** A documented takedown request supports later compliance / incident reporting.
- **Reduced casual reuse.** Lowers the chance that a non-targeted attacker stumbles on the credential by browsing the public artifact before the search-engine cache expires.

### Important: takedown is not automated

GitGuardian does not operate an automated takedown service against third-party hosts. The actual removal request goes through the host's published process. GitGuardian's platform exposes **DMCA takedown** as one of the incident-resolution reasons a customer can record when closing an incident — that records the takedown attempt for audit purposes; it does not perform the takedown.

### How the agent surfaces takedown

The agent gives the user three things:

1. **The URL of the public artifact** — the exact commit, gist, or repo containing the leaked credential.
2. **The host-specific reporting path:**
   - **Public GitHub repositories, commits, and gists:** [GitHub's Private Information Removal Policy](https://docs.github.com/en/site-policy/content-removal-policies/github-private-information-removal-policy) and [Submitting Content Removal Requests](https://docs.github.com/en/site-policy/content-removal-policies/submitting-content-removal-requests). The credential owner submits the removal request directly.
   - **HMSL match in the GitGuardian corpus:** the source URL(s) on the GitGuardian incident view; takedown is recorded as the resolution reason once the host has removed the artifact. See [Public monitoring remediation](https://docs.gitguardian.com/public-monitoring/remediate/remediate-incidents).
   - **Other public hosts** (public GitLab, Bitbucket public repos, Pastebin, Stack Overflow, public docs sites): the agent locates the host's content-removal contact and provides the link. If the host has no documented process, surface that limitation honestly — there is no fallback channel the agent can invent.
3. **A one-line reminder that takedown is parallel to rotation, not a substitute.**

### What the agent does not promise

The agent does not promise that takedown will happen, that mirrors and archives will follow the host's removal, or that search engines will de-index promptly. Mirrors / forks / caches outside the host's control are not affected. This is information for the user's expectation-setting; it is not advice to skip the request.

## 12. Validation

Every mode ends with verification. Without it, the agent does not know whether the remediation actually worked.

### Universal validation

- **Re-scan the affected artifact.** `ggshield secret scan path <files-or-paths> --json` for file / path findings; `ggshield secret scan repo . --json` for repo-scope findings. The secret should no longer appear. If it does, the remediation didn't reach every consumer or the in-place fix was incomplete.

### Mode-specific validation

| Mode | Additional validation |
|---|---|
| Driver | Confirm the old credential is dead by exercising it deliberately (a service-specific check from [§ 9](#9-per-secret-type-appendix) — e.g., `AWS_ACCESS_KEY_ID=<old> aws sts get-caller-identity` expecting `InvalidClientTokenId`). |
| Coordination | Verify each consumer in the dependency map now uses the new credential, in the order defined by the rollout sequence. Spot-check service logs for `Unauthorized` / `InvalidClientTokenId` style errors from missed consumers in the 24h after cutover. |
| Escalation | The agent's deliverable is a ticket; the owning team validates. The agent surfaces "ask the owning team to confirm rotation completion and re-scan the affected artifact" as a follow-up. |
| Containment | Check for evidence of replay attempts: service logs / cloud audit trails (CloudTrail, GCP audit logs, Azure activity log) for the window from first public exposure to rotation. The agent does not drive forensics; it points at where to look and flags anomalies (unusual source IPs, unusual API patterns, unexpected resource creation). |

### When validation fails

If the re-scan still finds the secret: the fix didn't propagate. Re-enter the relevant track (most often the original detection context's track) with the now-known consumer that wasn't updated. If a forensic check reveals replay activity: escalate per the org's IR process; this is no longer a remediation problem.
