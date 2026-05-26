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

---

## 1. Principles

These claims are load-bearing. Every later section is downstream of one or more of them; the architectural choices in §§ 2–4 are direct consequences.

1. **Rotation is necessary but not sufficient.** A rotated credential is dead — that is what stops the attack. But the *cost* of getting from "credential is live in production" to "credential is rotated" is rarely a click. Coordination across systems, owners, and change-management processes can dwarf the technical rotation step. The agent's job is to acknowledge this cost, not paper over it.

2. **Public vs internal-private exposure are different incident types** — not different urgencies of the same incident. A public leak is scraped within minutes; the credential is burned regardless of what the developer does next. An internal-private leak has a finite, auditable set of cloners; force-pushing a fix is sometimes the right call. The history-rewrite playbook applies to one; the scrape-window framing applies to the other. Collapsing them produces wrong advice for at least one of the two.

3. **The agent's first job is triage, not action.** Driver mode (walking the user through revoke / regenerate / update-callers) is opt-in. The agent always asks who owns the credential and what it unlocks before assuming it can drive a rotation that may not be the developer's to drive. Honest "you don't own this, file a ticket with X" beats wrong "click this button now."

4. **Blast radius is orthogonal to exposure.** A credential leaked publicly might be a throwaway sandbox key (one click). A credential leaked only in a private repo might unlock production payment infrastructure (multi-team migration). The "where it leaked" question and the "what it unlocks" question both matter; one does not substitute for the other.

5. **History rewrite rarely earns its complexity publicly; sometimes it does privately with audited clones.** In public repos, mirrors / archives / caches / search indexes already hold the credential. Rewriting history forces a break across every consumer with no recovery benefit. In private repos with a finite known set of cloners, force-pushing + coordinated re-clone is viable when policy demands it.

6. **Friction is preferable to false confidence.** Three triage questions are more friction than one. The agent asks all three anyway, because the four deliverable shapes (§ 3) are materially different and using the wrong shape produces wrong advice. Friction is recoverable; wrong advice that the user follows is not.

---

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

### Canonical phrasings

Each implementation picks its own copy and tone; the doctrine ships one canonical phrasing per axis so that the *information being asked for* is the same across every GitGuardian agent. An implementation that wants softer wording is free to rephrase, but the answer space must remain the same.

**Exposure**

> Where has this credential landed? Pick one:
> - **Public** — anything on the open internet (public GitHub repo, public gist, paste site, public Docker image, public package).
> - **Internal-private** — your org's private GitHub / GitLab / Bitbucket, or another system only org members can read.
>
> If you're not sure who can read it, treat it as public.

**Ownership**

> Can you revoke and reissue this credential right now, on your own? Or does it belong to another team (platform / SRE / security / a vendor admin) that you'd need to file a ticket with? "I have the console access but I'd need approval to actually rotate" counts as not-yours for this question.

**Blast radius**

> What does this credential unlock? Pick the highest-impact match:
> - **Sandbox / personal** — your own test account, throwaway.
> - **Shared dev** — a dev or staging environment used by your team but not customers.
> - **Production-critical** — anything customers touch, anything that holds revenue / customer data / billing.

The phrasings above are the reference. They lead with the question, then enumerate answers, then resolve ambiguity ("if you're not sure…"). Implementations may compress (e.g., the in-app agent may pre-fill the exposure answer from incident metadata) but the answer space is fixed.

---

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

---

## 4. Implementation profiles

The doctrine is the universal contract; profiles describe how each implementation honors it. A new implementation adds a column.

| Axis | Open-source agent skill (this repo) | In-app agent (GitGuardian product) | Future profile |
|---|---|---|---|
| Detection context | Hook that fired (free) | Incident metadata (free) | TBD |
| Exposure | Asked, or derived from repo URL | Source type from incident (`public_github`, `private_github`, …) | TBD |
| Ownership | Asked | Best-guess from workspace member/team data, confirmed with the user | TBD |
| Blast radius | Asked | Asked, or inferred from secret type + service tier | TBD |

### Open-source agent skill

The implementation lives at `skills/scan-secrets/`, `skills/check-hmsl/`, future `skills/scan-machine/`, distributed via this repo's marketplace plugin. The agent's only free signal is which hook fired. Every other axis is asked of the user, in a single triage step before any deliverable is produced. The canonical phrasings in [§ 2](#2-the-four-triage-axes) are the reference; each skill adapts them to its detection context.

### In-app agent

> **Status:** working draft. The in-app column has not yet been confirmed with the in-app team; the rows below describe what the doctrine *expects* a context-rich profile to support, not what the product agent ships today. Treat this as the contract the in-app implementation should converge toward; revise the column once the in-app team has reviewed.

The implementation lives inside the GitGuardian product. The agent has workspace context: incident metadata (source type, validity, first-seen / last-seen timestamps), member and team data, past remediation patterns in the same workspace, and links to the underlying git host. The detection context and exposure axes are answered from incident metadata. Ownership is best-guessed from workspace data and confirmed with the user (the agent always offers the user an out, never assumes). Blast radius remains asked, since neither incident metadata nor workspace membership reliably encodes "this credential opens production-critical systems."

### Future profiles

Reserved for implementations with richer context: SecOps integrations (RBAC from identity provider, CMDB / service-catalog data for automated dependency mapping), autonomous remediation flows, or industry-specific tooling. Each new profile adds a column with no doctrine changes — the contract is the four axes, not how they get filled in.

---

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

1. **Unstage the change containing the secret** (`git restore --staged <file>`), then fix in place as in [§ 5.1](#51-agent-file-edit-hook-fired).
2. **If the commit message has already been written**, preserve it for re-use after the fix.

Re-scan; recommit only once clean.

### 5.3 Pre-push hook fired

The credential is in one or more local commits about to leave the machine. This is the last moment the secret can be removed without a rotation event.

1. **Most recent commit only** — fix the file, then `git add <file> && git commit --amend --no-edit`.
2. **Earlier commits in the unpushed range** — interactive rebase (`git rebase -i <base>`). Edit out, fixup, or squash the offending commits.
3. **After either rewrite**, re-scan the full repo (`ggshield secret scan repo . --json`). Push only once clean.

### Why no triage axes here

The credential has not been exposed. Ownership and blast radius are moot — rotation is not on the table. Detection context alone determines the deliverable. If the agent or the user is *unsure whether the secret has already been pushed* (e.g., the user can't remember, or this finding came from a routine repo scan rather than a hook), dispatch to the post-leak track instead. When in doubt, assume the secret has propagated.

---

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

---

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
2. **Rotate first** (always — see [Triage flow](#triage-flow-1) below). Don't rely on the rewrite to stop the attack.
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

---

## 8. Off-repo exposure track

The credential sits on a developer machine outside git: dotfiles, shell history (`.bash_history`, `.zsh_history`), cloud CLI configs (`~/.aws/credentials`, `~/.kube/config`, `gcloud` defaults), agent caches, abandoned project trees in `~/Downloads` or `~/tmp`. This is `scan-machine` territory. **Not a "leak" in the git sense** — the secret has not propagated through commit / push / repo-clone — but it remains exfiltrable through other paths.

### Exfiltration model

The exposure surface is different from a repo leak. Risk paths include:

- **Local disk access by an attacker** with workstation-level compromise (malware, lost laptop, insider).
- **Backup vendors** that snapshot the developer's home directory to a third party (corporate iCloud / OneDrive / Dropbox, automatic backup tools).
- **Shared dev environments** where "the machine" isn't a single workstation — Codespaces, dev containers, cloud IDEs, jump hosts. The credential may already be visible to whoever administers the shared infrastructure.
- **Future scanning** by automation that traverses the file system, including future invocations of the agent itself.

### Triage flow

Detection context is `scan-machine` and is free. The other axes are reframed for the off-repo context: ownership splits into *two* questions, because "who owns the credential" and "who owns the machine" can be different people, and both matter.

1. **Exposure — different read-path here.** *"Is this machine personally owned, corp-issued, or a shared environment (Codespaces, dev container, jump host)? Is anything in your home directory backed up to an external service?"* Answers map to the same public-facing / internal-private split, with shared environments and external backup tipping toward the public-facing playbook because the read-path widens past the developer.
2. **Machine / profile ownership.** *"Whose machine or shell profile is this finding on? You? A teammate? A shared dev environment whose admin is someone else?"* This determines who can clean up the off-repo location (delete the file, edit the dotfile, scrub the shell history). A finding on a teammate's profile or a shared jump host is not the developer's to scrub directly; the agent's deliverable for cleanup becomes a handoff to the owner of the profile.
3. **Credential ownership.** Same axis as the post-leak tracks: does the developer have authority to revoke and reissue this credential? Determines who can drive the rotation half.
4. **Blast radius.** Same axis: sandbox / shared dev / production-critical.

The two ownership questions can have different answers (e.g., the developer owns the credential but the machine is shared, or the machine is theirs but the credential belongs to another team). The agent treats them as independent and selects the deliverable per the *more restrictive* of the two.

Dispatch follows the same mode-selection table as the post-leak tracks based on the combined ownership + blast-radius answers. Public-leak takedown does not apply (no public artifact to take down), but the *behavioral* containment-mode checklist (treat credential as burned, hunt for anomalous usage, document the exposure timeline) is appropriate when the answers land there.

### Remediation in addition to rotation

For the off-repo track, the agent also surfaces "remove the credential from the off-repo location it was found" — delete the file, edit the dotfile, scrub the shell history entry. This is independent of rotation and applies regardless of mode. When the machine-ownership answer is "not me" (teammate, shared infrastructure), the scrub becomes a handoff with explicit location coordinates rather than a self-driven action. The doctrine does *not* specify the per-location scrub commands here (they vary by shell, OS, and backup vendor); the `scan-machine` skill carries the dispatch.

---

## 9. Per-secret-type appendix

This appendix is the only section that's mostly invariant across implementations — rotating an AWS key is the same job whether the in-app agent or the open-source skill drives it. The doctrine ships ten worked examples plus a schema for the long tail.

> **Vendor-link caveat.** Console navigation paths and admin URLs change. Every implementation that consumes this appendix should cross-check the vendor's current docs at use time. Where a worked example below cites a console path, the path is current as of this doctrine's date; if the vendor moved the page, follow the vendor's current breadcrumb. The conceptual flow (revoke → regenerate → update-callers → verify) is stable; the click-path is not.

### 9.0 Schema

Every per-type entry contains the same six fields, in the same order. The schema is the template for any secret type not in the worked examples below: the implementing agent fills it using vendor documentation and its own context.

| Field | Content |
|---|---|
| **What it is** | One sentence: what the credential authorizes and where it's typically issued. |
| **Revoke location** | The exact navigation path in the issuing vendor's console (or API call) to deactivate / invalidate the credential. |
| **Regenerate location** | Where a new credential is created. Often (not always) the same console page. |
| **Common consumers** | Where this credential type is typically wired in: env vars, secrets-manager entries, CI configs, IaC files, dotfiles. Used by [Driver mode](#3-the-four-deliverable-modes). |
| **Dependency mapping for this type** | Specialization of [§ 10 steps 2–3](#10-generic-coordination-framework) for this credential type. Concrete commands and reports for finding consumers and their owners. Used by [Coordination mode](#3-the-four-deliverable-modes). |
| **Post-rotation verification** | How to confirm the old credential is dead and the new one works. Service-specific check + a generic re-scan. |

### 9.1 AWS access keys

**What it is.** An access-key-ID + secret-access-key pair issued to an IAM user (less commonly bound to an IAM role via STS). Authenticates AWS SDK / CLI / API calls against the IAM principal's attached policies.

**Revoke location.** AWS Console → IAM → Users → *username* → Security credentials → Access keys → set the leaked key to *Inactive*, then *Delete* once you've confirmed no consumer still uses it. CLI equivalent:

```bash
aws iam update-access-key --access-key-id AKIA... --status Inactive --user-name <user>
aws iam delete-access-key  --access-key-id AKIA... --user-name <user>
```

Always go *Inactive → confirm no breakage → Delete*. Deactivation is reversible for ~24h of consumer-discovery; deletion is not.

**Regenerate location.** Same page → *Create access key*. IAM users can hold two active access keys simultaneously, which is the overlap mechanism for graceful rotation. Strongly prefer short-lived STS credentials or IAM Identity Center for new workloads; if you're issuing a long-lived access key in 2026, flag the underlying pattern as itself a finding worth addressing.

**Common consumers.**

- `~/.aws/credentials` and `~/.aws/config` on developer / build machines
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, sometimes `AWS_SESSION_TOKEN`) on services, Lambda functions, ECS task definitions, EC2 user-data, Kubernetes secrets
- CI provider secrets (GitHub Actions secrets, GitLab CI variables, CircleCI contexts, Buildkite agent env)
- IaC files (Terraform `aws_iam_access_key` resources, Pulumi equivalents) — note that hardcoding keys in IaC is itself a finding
- Third-party SaaS integrations configured with the IAM user's keys (CI/CD, monitoring, backup vendors, data warehouses with S3 sources)
- AWS Secrets Manager / Parameter Store entries that wrap the access key (rare but happens)

**Dependency mapping for this type.**

1. Pull the **IAM credential report** to see when the key was last used and against which service:

   ```bash
   aws iam generate-credential-report
   aws iam get-credential-report --query Content --output text | base64 -d
   ```

2. Query **CloudTrail** for the access key ID over the relevant window. This produces the list of services and IPs that invoked the credential:

   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA... \
     --start-time <ISO8601> --end-time <ISO8601>
   ```

3. Grep the org's repos for the access key ID and the canonical env-var names:

   ```bash
   git grep -nE 'AKIA[0-9A-Z]{16}|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY'
   ```

4. List runtime consumers that may hold the key in environment configuration:

   ```bash
   # Lambda functions
   aws lambda list-functions --query 'Functions[].FunctionName' --output text \
     | tr '\t' '\n' \
     | while read -r fn; do aws lambda get-function-configuration --function-name "$fn" \
       --query 'Environment.Variables' --output json; done

   # ECS task definitions (current revisions only)
   aws ecs list-task-definitions --status ACTIVE --query 'taskDefinitionArns[]' --output text

   # EC2 instances with user-data that may template the key
   aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId'
   ```

5. Check each CI provider's secrets configuration (GitHub Actions `repo:variables`, GitLab CI variables, CircleCI context env, etc.).

6. Inventory third-party integrations in the AWS account by reviewing the IAM user's tags / description and any cross-account roles that wrap it.

Map consumers from steps 1–6 to owning teams. Each owner gets a wave in the rollout sequence. AWS access keys support overlap (two active per user), so the standard rollout is: create new key → distribute to consumers wave-by-wave with the old key still active → deactivate the old key for a soak window → delete.

**Post-rotation verification.**

- Confirm the old key is *Deleted* (not just *Inactive*) in the IAM console once the soak window passes.
- Issue a deliberate AWS API call using the old key and confirm `InvalidClientTokenId`:

  ```bash
  AWS_ACCESS_KEY_ID=AKIA... AWS_SECRET_ACCESS_KEY=... aws sts get-caller-identity
  # expect: An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Spot-check CloudTrail for `Failure` events using the old access key ID for 24–72h after the rotation completes — surfaces consumers that were missed in the dependency map.

Canonical AWS reference: <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html>.

### 9.2 GitHub personal access tokens

**What it is.** A token issued to a GitHub user account that grants programmatic access on the user's behalf. Two flavors:

- **Classic PAT** — broad scopes (`repo`, `workflow`, `admin:org`, …), all-or-nothing per scope, no per-repo restriction, no built-in expiration unless the user sets one. Avoid for new use.
- **Fine-grained PAT** — scoped to specific repositories, with per-permission grants (read/write per resource), mandatory expiration. The recommended form for new tokens.

**Revoke location.** GitHub → Settings (user) → Developer settings → Personal access tokens → *Tokens (classic)* or *Fine-grained tokens* → click the token → *Delete*. CLI equivalent for classic PATs via the OAuth Authorizations API (requires basic auth + 2FA OTP header):

```bash
# Replace TOKEN_ID with the authorization ID; see /authorizations endpoint
gh api -X DELETE /authorizations/<TOKEN_ID>
```

For fine-grained PATs, deletion is UI-only — no public API surface yet. The agent surfaces the UI path and stops.

**Regenerate location.** Same page → *Generate new token* (fine-grained recommended). The new token is shown once; cannot be retrieved later. If the original token was a classic PAT, the rotation is also the right moment to migrate to a fine-grained PAT with scoped repo + permission grants.

**Common consumers.**

- `~/.gitconfig` or `~/.git-credentials` via the Git credential helper (`git config --global credential.helper`)
- `~/.config/gh/hosts.yml` if installed via `gh auth login`
- Environment variables on developer machines / CI: `GH_TOKEN`, `GITHUB_TOKEN` (note `GITHUB_TOKEN` is *also* the auto-injected job-scoped token in GitHub Actions — distinguish before assuming a leak)
- GitHub Actions secrets used by workflows to call back into the API at a higher privilege than the auto-injected `GITHUB_TOKEN` allows (cross-repo dispatch, package publish, admin operations)
- Third-party CI integrations (Codecov, Sentry releases, deployment platforms) configured with a PAT instead of an installation token
- Bots and automation accounts whose PATs power org-wide tooling — these are the highest-impact rotations because consumers are often opaque

**Dependency mapping for this type.**

1. Check the token's **Last used** timestamp and accessed-repo list on the token detail page (fine-grained PATs show this directly; classic PATs show last-used date only).
2. Inventory what the token has access to:

   ```bash
   GH_TOKEN=<old-token> gh api /user/repos --paginate --jq '.[].full_name'
   GH_TOKEN=<old-token> gh api /user/orgs   --paginate --jq '.[].login'
   ```

3. Grep the org's repos for likely env-var consumers and config patterns:

   ```bash
   git grep -nE 'GH_TOKEN|GITHUB_TOKEN|github\.com/[^/]+/[^/]+\.git.*[a-zA-Z0-9_]{20,}'
   ```

4. List GitHub Actions secrets across the org (requires admin):

   ```bash
   gh api /orgs/<org>/actions/secrets --paginate --jq '.secrets[].name'
   for repo in $(gh repo list <org> --json nameWithOwner --jq '.[].nameWithOwner'); do
     gh api "/repos/$repo/actions/secrets" --jq ".secrets[].name" 2>/dev/null
   done
   ```

5. Check the audit log for actions performed by the token's owner user account, filtered to the suspected exposure window. GitHub's enterprise audit log API exposes this; smaller orgs can use the org-level audit log UI.

6. For bot / automation PATs, ask the owning team for the consumer list — there's rarely a programmatic shortcut here.

Map consumers to teams. Fine-grained PATs support multiple active tokens per user, so overlap rollout is possible: issue new token → distribute → deactivate old. Classic PATs have no overlap constraint per se, but each token's name/scope is distinct, so duplicating is straightforward.

**Post-rotation verification.**

- Confirm the old token no longer appears in the user's PAT list.
- Issue a deliberate API call with the old token and confirm `401 Bad credentials`:

  ```bash
  curl -i -H "Authorization: Bearer <old-token>" https://api.github.com/user
  # expect: HTTP/2 401 ... "message": "Bad credentials"
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch GitHub Actions runs and any external CI for `Bad credentials` failures over the next 24–48h — surfaces consumers that were missed.

Canonical GitHub reference: <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>.

### 9.3 Generic API key

**What it is.** The schema applied without service-specific hooks — the long-tail template for any vendor not given a dedicated entry below. Covers most SaaS API keys (vendor X issues `xxx_live_…` style tokens via a dashboard, you paste them into env vars). Use this entry as a thinking template when the specific vendor isn't catalogued.

**Revoke location.** The issuing vendor's API key management page. Almost always under *Settings → API keys* (Datadog, Sentry, Stripe-style vendors), *Developers → API keys* (Stripe itself, Cloudflare), or *Account → Tokens* (Snowflake, Heroku). If the vendor offers per-key labels, the label is usually how you find the leaked key in the list; if it doesn't, you may need to revoke all and reissue.

**Regenerate location.** Same page → *Create new key* / *Roll key* / *Generate token*. Some vendors (Stripe, Cloudflare) support per-key expiration and per-key scoping; prefer these on the new key. Many do not — they only offer "active key" or "revoked key" with no overlap.

**Common consumers.**

- Environment variables on the consuming service (the vendor's docs almost always tell you which env-var name they expect, e.g., `DATADOG_API_KEY`, `SENTRY_AUTH_TOKEN`).
- Secrets-manager entries that templates / config systems pull from.
- CI provider secrets, if the key is used during builds (for source map uploads, release tagging, deploy hooks).
- **Client-side bundles.** A public-facing API key (publishable / publishable-style keys) is *meant* to be exposed and is not a leak. A secret API key that landed in a frontend bundle is a real leak — distinguish by inspecting the key's prefix and the vendor's docs. When in doubt, treat as secret.
- IaC files for vendor-managed resources (Terraform providers usually accept the API key via env var or a `provider {}` block; the latter is itself a finding).

**Dependency mapping for this type.**

This is the [§ 10](#10-generic-coordination-framework) steps 2–3 with no vendor-specific shortcuts:

1. The vendor's dashboard may show *last-used* or *recent API requests* per key. Check first — it's the cheapest signal.
2. Grep the org's repos for the leaked key value (truncated, to avoid storing the full secret in your search tool's history) and for the vendor's canonical env-var name.
3. List runtime services that depend on the vendor — your CMDB, service catalog, or `grep -r <vendor-name>` in deploy configs.
4. Ask each likely owning team.

If the vendor supports per-key scoping, the new key should be more narrowly scoped than the old; document the scope reduction in the change ticket.

**Post-rotation verification.**

- Issue a deliberate API call with the old key against any vendor endpoint and expect 401 / 403. Most vendors return one of:
  - `HTTP 401 Unauthorized`
  - `HTTP 403 Forbidden`
  - Vendor-specific JSON with `code: "invalid_api_key"` or similar.
- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the vendor's dashboard (request volume, error rate) and the consuming services' logs for `Unauthorized` over the next 24h.

### 9.4 Database connection URLs

**What it is.** A connection string carrying credentials for a database — PostgreSQL (`postgres://user:pass@host:5432/db`), MySQL (`mysql://…`), MongoDB (`mongodb+srv://…`), Redis (`redis://default:pass@…`), or vendor-specific managed variants (Snowflake account URLs, Cloud SQL connection names with embedded passwords). The leaked secret is typically the password embedded in the URL; the host / port / database name are usually not sensitive on their own but compound the exposure.

**Revoke location.** On the database itself, not in a console. SQL approach for the major engines:

```sql
-- PostgreSQL: rotate the role's password
ALTER USER app_service WITH PASSWORD '<new-strong-password>';

-- MySQL
ALTER USER 'app_service'@'%' IDENTIFIED BY '<new-strong-password>';
FLUSH PRIVILEGES;

-- MongoDB (run on the admin database against the appropriate auth source)
db.changeUserPassword("app_service", "<new-strong-password>")

-- Redis (in the relevant ACL config or via CLI)
ACL SETUSER app_service ON '>NEW_PASSWORD' ~* +@all
```

For managed services the rotation also has a console path: AWS RDS → Modify → master password; Cloud SQL → User → Change password; MongoDB Atlas → Database Access → user → Edit; Redis Enterprise / Upstash dashboards each have an equivalent. Use the console path when the database admin user is the leaked one — you may not have a separate admin to run SQL with.

**Regenerate location.** Same path — `ALTER USER`-style commands set the new password; the *value* is what the agent surfaces back to consumers.

**Overlap support varies** and determines the rollout shape:

- **No overlap (single password per role):** the moment you rotate, every consumer with the old password loses its connection. Requires coordinated cutover or a maintenance window.
- **With overlap (two roles, same grants):** create a *new role* (e.g., `app_service_v2`) with identical grants, distribute its credentials, then drop or revoke the old role once consumers have moved. The DB engine treats them as distinct principals; old / new can coexist.

Always prefer the overlap pattern in production. The "rotate the password in place" approach is a coordinated cut at a specific moment, and missed consumers fail until manually fixed.

**Common consumers.**

- App config in env vars (`DATABASE_URL`, `POSTGRES_URL`, `MONGO_URI`) on every service that talks to the database
- ORM config files (Rails `database.yml`, Django `settings.py`, Sequelize / Prisma config) — distinguish leaked passwords in *committed* files vs env-var references
- Connection-pool sidecars: pgbouncer, ProxySQL, AWS RDS Proxy, MongoDB Atlas proxy — each holds its own copy
- Background-job / scheduler configs (Sidekiq, Celery, Airflow, cron-driven backups)
- BI / dashboarding tools (Metabase, Tableau, Looker) that hold long-lived DB credentials for the warehouse
- Read-only consumers and replicas often hold their own connection strings (analytics replicas, ETL pipelines)
- Backup jobs (logical dumps, replication processes) that authenticate as a separate role

**Dependency mapping for this type.**

1. Query the database's live session table to identify connected clients:

   ```sql
   -- PostgreSQL
   SELECT pid, usename, application_name, client_addr, state, backend_start
   FROM pg_stat_activity
   WHERE usename = 'app_service';

   -- MySQL
   SHOW PROCESSLIST;
   -- Or for richer detail:
   SELECT user, host, db, command, state FROM information_schema.processlist
   WHERE user = 'app_service';

   -- MongoDB
   db.currentOp({ "appName": { $exists: true } })
   ```

   `application_name` and `client_addr` give you a starting point for which services and IPs are still connected as the leaked role.

2. Pull recent connection history if your database engine logs it: PostgreSQL `pg_stat_database`, RDS Performance Insights, Cloud SQL logs, Atlas database access history.

3. Grep the org's repos for the leaked connection string fragments (host + db, prefix) and for the canonical env-var names:

   ```bash
   git grep -nE 'DATABASE_URL|POSTGRES_URL|MYSQL_URL|MONGO_URI|REDIS_URL'
   ```

4. Check the connection-pool configs (pgbouncer's `userlist.txt`, ProxySQL's `mysql_users` table) for the role's password.

5. Inventory BI tool connections — these are often missed because the BI team is separate from the engineering org.

6. List replicas and downstream consumers (read replicas, analytics warehouses, change-data-capture sinks).

Map consumers to teams. Sequence the rollout per [§ 10](#10-generic-coordination-framework) step 5; overlap pattern is strongly preferred for production.

**Post-rotation verification.**

- Issue a deliberate connection attempt with the old credentials and expect authentication failure:

  ```bash
  # PostgreSQL
  PGPASSWORD='<old-password>' psql -h <host> -U app_service -d <db> -c 'SELECT 1'
  # expect: psql: error: FATAL: password authentication failed for user "app_service"

  # MySQL
  mysql -h <host> -u app_service -p'<old-password>' -e 'SELECT 1'
  # expect: ERROR 1045 (28000): Access denied for user 'app_service'@'...'
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the DB's auth-failure log for the leaked role for 24–72h; surfaces consumers that were missed in the dependency map.
- If you took the *new-role* overlap path, drop or revoke the old role only after the auth-failure log is silent and `pg_stat_activity` shows no connections.

### 9.5 Private keys (RSA / EC / SSH)

**What it is.** An asymmetric key whose *private* half has leaked. Three common subtypes share most of the playbook but differ in where the public half is registered:

- **SSH user / deploy keys** — public half in a server's `~/.ssh/authorized_keys` or in a Git host's deploy-keys list.
- **SSH host keys** — public half in client `~/.ssh/known_hosts` entries; leaks here enable man-in-the-middle attacks against future connections.
- **Application keys** — signing keys (JWT / token-signing / package-signing) or TLS private keys. Public half is in the relying party's trust store (JWKS endpoint, pinned cert list, OS cert store).

**Revoke ≠ regenerate for keys.** Critically, you can't "revoke" a private key by destroying it — anyone who has the leaked copy still has it. Revocation requires updating *every consumer of the public half* to stop trusting it. This is fundamentally different from password / token rotation.

**Revoke location.** Wherever the public half is registered:

- **SSH user/deploy keys** — remove the public-key entry from the server's `~/.ssh/authorized_keys` (every server that trusts it) or from the Git host's deploy-keys settings. For GitHub: Settings → SSH and GPG keys → Delete.
- **SSH host keys** — clients must remove the stale `known_hosts` entry; if the host key was rotated on the server, clients also re-pin to the new fingerprint on next connection (after verifying out-of-band).
- **JWT / token-signing keys** — remove the public key from the JWKS endpoint or rotate the `kid` so verifiers reject tokens signed by the old key.
- **TLS private keys** — request revocation of the corresponding certificate from the issuing CA (and consider it issued-but-unrevoked until OCSP / CRL propagates, which can take hours).
- **Code-signing / package-signing keys** — remove from the relying party's trust store, push key-rollover packages to update-distributing infrastructure, and if the key was published in a CRL, ensure clients honor the CRL.

**Regenerate location.** Generate a new keypair locally (`ssh-keygen -t ed25519 -f new_key`, `openssl genpkey ...`, language-specific JWT libraries for app keys). The private half stays on the machine that needs to sign; the public half is the artifact you distribute.

**Common consumers.**

- `~/.ssh/authorized_keys` files on every server the key was authorized for (potentially many)
- Git host deploy-keys settings (GitHub, GitLab, Bitbucket — per-repo or per-org)
- CI runners with SSH access to deploy targets (deploy keys on runners)
- JWKS endpoints (typically published at `/.well-known/jwks.json` on the issuer; verifiers cache these)
- TLS termination configs (load balancers, ingress controllers, nginx / Envoy / HAProxy configs) — the private key lives in a file referenced by the config
- Pinned-certificate lists in mobile apps, embedded systems, or any client that does TLS pinning
- Package manager trust stores (apt repository signing keys, container image signing roots like cosign / Sigstore)
- Configuration management secret stores (Ansible Vault, Chef encrypted data bags) where the key was templated

**Dependency mapping for this type.**

1. Compute the key's fingerprint and use it as the search key:

   ```bash
   ssh-keygen -lf <public-key-file>
   # SHA256:abc123... user@host
   openssl pkey -in <private-key-file> -pubout -outform DER | sha256sum
   ```

2. SSH user/deploy keys: scan the org's `authorized_keys` files. If servers are managed by configuration management, the search is across the config repo:

   ```bash
   # Across an Ansible / Chef repo
   grep -rE 'ssh-(rsa|ed25519|ecdsa)' .
   # Filter for the specific public key
   grep -rF "$(awk '{print $2}' <public-key-file>)" .
   ```

3. Git host deploy keys: list via API (example: GitHub):

   ```bash
   for repo in $(gh repo list <org> --json nameWithOwner --jq '.[].nameWithOwner'); do
     gh api "/repos/$repo/keys" --jq ".[].title"
   done
   ```

4. JWT / token-signing keys: identify the JWKS endpoint, list all `kid`s currently published, and identify which verifiers consume it.
5. TLS keys: inventory the load balancer / ingress / TLS-terminating proxy configs and any backup systems that include the keystore in disk snapshots.
6. Code-signing keys: ask the team that publishes the signed artifact (the relying parties are wherever the artifact gets consumed — could be globally distributed; this is often a coordination project, not a query).

The dependency map for keys is usually *wider* than for passwords because the public half can be distributed independently of any usage signal. Plan for under-discovery; expect to find consumers post-rotation through breakage.

**Post-rotation verification.**

- Attempt to use the old private key for its purpose and expect failure:

  ```bash
  # SSH key
  ssh -i <old-private-key> -o StrictHostKeyChecking=no <user>@<host>
  # expect: Permission denied (publickey)

  # JWT signing key
  # Sign a test JWT with the old key, present it to the verifier — expect 401 / invalid signature.
  ```

- If the key was published in a Certificate Revocation List, verify the CRL has propagated (`openssl crl -in <crl> -noout -text`) or check OCSP status (`openssl ocsp …`).
- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- For SSH keys, watch the `auth.log` (Linux) / `secure` (RHEL) / SSH audit logs on the previously-trusting servers for failed authentication attempts with the old key — surfaces consumers that were missed.

### 9.6 Stripe API keys

**What it is.** A key issued by Stripe for programmatic access to a Stripe account's API. Two key axes matter:

- **Live vs test** — `sk_live_...` vs `sk_test_...`. A leaked test key in a public repo is a finding but not a security incident; a leaked live key is.
- **Unrestricted vs restricted** — unrestricted secret keys grant full account access; restricted keys (created via Dashboard) scope permissions per resource. Treat unrestricted-secret-key leaks as worst-case Stripe.

Publishable keys (`pk_live_...`, `pk_test_...`) are *meant* to be exposed in client-side bundles; finding one in a public repo is not a leak. Verify the prefix before treating as an incident.

**Revoke location.** Stripe Dashboard → Developers → API keys → click the leaked key → *Roll key…* (rolls + sets an expiration window on the old key, supporting graceful overlap) or *Delete*. Restricted keys appear in the same list and roll the same way. There is no public CLI for revoking secret keys — Dashboard is the supported path.

**Regenerate location.** Same page. *Roll* creates a new key value with the same scopes and triggers an expiry on the old one; the default rollover window is 12 hours, configurable up to 7 days. *Create restricted key* makes a new scoped key.

**Common consumers.**

- Backend services that call Stripe's API — env var `STRIPE_SECRET_KEY` or `STRIPE_API_KEY` on payment-handling services
- Webhook signature verification — a separate `whsec_…` value lives in webhook endpoint configs and rotates independently (don't conflate; if a `whsec_` value leaked, that's a different rotation)
- CI configurations that exercise Stripe in integration tests (should be test keys, but worth verifying)
- BI / data pipelines pulling Stripe event data via their API
- Third-party platforms that aggregate Stripe accounts (BillForward, Recurly migrations, accounting integrations) — these often hold restricted keys

**Dependency mapping for this type.**

1. Stripe Dashboard → Developers → Logs filters by API key. Filter to the leaked key for the exposure window; the log shows endpoint, IP, and Stripe-version per request. This is the cleanest first signal.
2. Grep the org's repos for the canonical env-var names and the leaked key prefix:

   ```bash
   git grep -nE 'STRIPE_(SECRET|API)_KEY|sk_live_|sk_test_'
   ```

3. List services that depend on Stripe — your CMDB / service catalog should have this; otherwise search deploy configs.
4. Check CI secret stores (GitHub Actions, GitLab CI, etc.) for `STRIPE_*` entries.
5. Inventory third-party integrations from the Stripe Dashboard's *Connected apps* / *Apps* section.

Stripe's *Roll key* with an expiry window is the canonical overlap mechanism. Roll → distribute new value to consumers within the window → confirm logs show the new key in use → let the old key expire automatically.

**Post-rotation verification.**

- Once the rollover window passes, confirm the old key returns `401`:

  ```bash
  curl -i -u <old-sk_live_key>: https://api.stripe.com/v1/charges?limit=1
  # expect: HTTP/2 401 ... "error": { "type": "invalid_request_error", "code": "api_key_expired" }
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch Stripe Dashboard's API request logs for failures attributed to the old key; surfaces consumers that didn't pick up the new value before the rollover expired.

Canonical Stripe reference: <https://docs.stripe.com/keys>.

### 9.7 Slack incoming webhooks

**What it is.** A URL of the form `https://hooks.slack.com/services/T<team>/B<channel-binding>/<secret>` that lets anyone with the URL post messages into a specific Slack channel as a specific app integration. The URL *is* the credential — there is no separate username / token.

**Revoke location.** Two paths depending on how the webhook was created:

- **Created from a Slack app's Incoming Webhooks feature** — Slack app config → Features → Incoming Webhooks → find the webhook in the list → *Delete*. The owning user is whoever installed the app to the channel; they're the only one who can delete it.
- **Created from the legacy "Incoming Webhooks" custom integration** — Workspace admin → *Manage* → *Custom Integrations* → Incoming Webhooks → click → *Disable* / *Remove*. Most orgs have migrated off these, but some remain.

There is no API to revoke an individual webhook URL programmatically — UI only.

**Regenerate location.** Same UI path → *Add New Webhook* (Slack app) or *Add Incoming Webhooks Integration* (legacy). The new URL is generated immediately; cannot be retrieved later (Slack shows it once on the integration page, but copy-paste is the only path).

**Common consumers.**

- Monitoring and alerting (Prometheus Alertmanager `slack_configs`, Datadog Slack integration, PagerDuty → Slack, custom alerting scripts)
- CI failure notifications (GitHub Actions `slackapi/slack-github-action`, Jenkins Slack plugin, GitLab CI custom scripts)
- Deployment hooks (post-deploy success / failure messages from CD pipelines)
- Personal automation scripts that the developer wrote against the channel they own
- Status pages and uptime monitors (StatusCake, BetterUptime, Uptime Robot)

**Dependency mapping for this type.**

1. Grep the org's repos for the Slack webhook URL format and the leaked URL fragment:

   ```bash
   git grep -nE 'hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[a-zA-Z0-9]+'
   ```

2. Check Alertmanager / monitoring configs for Slack receivers.
3. Slack workspace owner → Manage apps → click the app that owns the webhook → see channel posts in recent activity (no per-URL request log, unfortunately, so this is coarse).
4. Check CI secret stores for `SLACK_WEBHOOK_URL` / `SLACK_WEBHOOK` entries.
5. Ask the team that owns the destination channel — they likely know what posts there.

No overlap mechanism. Both URLs work until you delete the old; coordinate consumers to switch, then delete.

**Post-rotation verification.**

- Send a deliberate POST to the old URL and expect a non-200 response:

  ```bash
  curl -i -X POST -H 'Content-Type: application/json' \
    -d '{"text":"verification probe"}' \
    https://hooks.slack.com/services/T.../B.../<old-secret>
  # expect: 404 invalid_token, or similar non-200
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the destination Slack channel for missing messages (alert silence is a *symptom*, not a great verification — pair with the explicit probe above).

Canonical Slack reference: <https://api.slack.com/messaging/webhooks>.

### 9.8 GCP service account JSON

**What it is.** A JSON key file containing a service account's private key, downloaded once from the GCP console at creation time. Authenticates against GCP APIs as the service account; carries whatever IAM bindings that account has been granted. Format: a JSON object with `type: "service_account"`, `project_id`, `private_key_id`, `private_key`, `client_email`, and friends.

> **Strong recommendation.** Prefer **Workload Identity Federation** (for GKE, GitHub Actions, GitLab, etc.) or short-lived OAuth tokens over downloaded JSON keys for new workloads. If this finding is the first time the JSON-key pattern is being scrutinized, surface the alternative as part of the remediation — the rotation is the right moment to migrate.

**Revoke location.** GCP Console → IAM & Admin → Service Accounts → click the service account → Keys tab → find the key by `key_id` (matches `private_key_id` in the JSON) → *Delete*. CLI equivalent:

```bash
# List keys for the service account
gcloud iam service-accounts keys list \
  --iam-account=<sa-email> \
  --project=<project-id>

# Delete the leaked key
gcloud iam service-accounts keys delete <key-id> \
  --iam-account=<sa-email> \
  --project=<project-id>
```

Deletion is immediate and irreversible. There is no "disable" intermediate state — deletion is the only revocation path.

**Regenerate location.** Same Keys tab → *Add Key* → *Create new key* → JSON. The new file downloads immediately. A service account can hold multiple active keys (up to 10), supporting overlap rollouts.

**Common consumers.**

- Environment variable `GOOGLE_APPLICATION_CREDENTIALS` set to a file path on the consuming machine / pod
- Mounted file paths in Kubernetes pods, Cloud Run services, App Engine deploys, CI runners
- Kubernetes secrets (the JSON pasted as a `Secret` and mounted into pods) — the leak vector is often the secret manifest checked into git
- CI provider secrets (GitHub Actions, GitLab CI) — base64-encoded JSON pasted into a secret variable
- Terraform / Pulumi state files when the GCP provider was configured with credentials inline
- Local developer machines authenticating gcloud-aware tools without `gcloud auth application-default login`

**Dependency mapping for this type.**

1. GCP audit logs filtered by the service account principal email surface caller identities and source IPs:

   ```bash
   gcloud logging read \
     "protoPayload.authenticationInfo.principalEmail=\"<sa-email>\"" \
     --project=<project-id> \
     --freshness=30d \
     --format=json \
     --limit=1000
   ```

   The `protoPayload.requestMetadata.callerIp` field gives the source IP per call.

2. Grep the org's repos for the service account email and the `private_key_id`:

   ```bash
   git grep -nE '<sa-email>|"private_key_id"|GOOGLE_APPLICATION_CREDENTIALS'
   ```

3. List Kubernetes secrets that may hold service account JSON:

   ```bash
   # Across all namespaces in a cluster
   kubectl get secrets --all-namespaces -o json \
     | jq -r '.items[] | select(.type == "Opaque") | .metadata.namespace + "/" + .metadata.name'
   ```

   Then `kubectl get secret <name> -o jsonpath='{.data}' | base64 -d` (cautiously) to verify which hold the leaked key.

4. Check CI secret stores for `GCP_SA_KEY` / `GOOGLE_CREDENTIALS` entries.
5. Inventory Cloud Run / App Engine / GKE workloads that may have been configured with the SA.

The 10-keys-per-SA limit supports overlap: create new key → distribute → confirm new key in audit logs → delete old.

**Post-rotation verification.**

- Authenticate deliberately with the old JSON and expect `401 invalid_grant`:

  ```bash
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/old-key.json \
    gcloud auth application-default print-access-token
  # expect: ERROR: ... invalid_grant ... Account has been disabled / Key has been deleted
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch GCP audit logs for `permission_denied` events from the SA over the next 24–72h; surfaces consumers that were missed.
- Spot-check Kubernetes pods for `Failed to authenticate` errors in their stdout / stderr if the SA was used for pod-level auth.

Canonical GCP reference: <https://cloud.google.com/iam/docs/keys-create-delete>.

---

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
