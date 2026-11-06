# GitGuardian Remediation Doctrine

> **Status:** draft (pre-1.0)
> **Audience:** the `triage-incidents` skill, and any GitGuardian agent or human building an incident-remediation flow — open-source agent skills, in-app agent, internal tooling, security teams.
> **Scope:** what to do when a leaked credential is found. Agent-side companion to the customer-facing IR guidance on docs.gitguardian.com.
> **Detection context:** post-leak only. Incidents reaching this skill are already detected by the GitGuardian platform; the pre-leak track does not apply and is intentionally omitted (see § 5). This is a tailored sibling of the `scan-secrets` doctrine — kept structurally diffable against it; the only divergence is the omitted pre-leak track (§ 5). The custom-workflow overlay (§ 13) is parallel in both doctrines — here it covers the Incident-page touchpoint; in the `scan-secrets` sibling it covers the pre-leak touchpoints.

When a credential is found leaking, the agent's first job is not to act — it is to know enough to act well. This doctrine prescribes what the agent must know before producing a deliverable, what shapes a deliverable can take, and how to dispatch across the lifecycle stages where a leaked credential can be discovered. The same logic drives every GitGuardian agent: the open-source skills shipped from this repo, the in-app agent inside the GitGuardian product, and future profiles (SecOps integrations, autonomous remediation).

## Contents

1. [Principles](#1-principles)
2. [The four triage axes](#2-the-four-triage-axes)
3. [The four deliverable modes](#3-the-four-deliverable-modes)
4. [Implementation profiles](#4-implementation-profiles)
5. [Pre-leak track — not applicable here](#5-pre-leak-track--not-applicable-here)
6. [Post-leak / public-facing track](#6-post-leak--public-facing-track)
7. [Post-leak / internal-private track](#7-post-leak--internal-private-track)
8. [Off-repo exposure track](#8-off-repo-exposure-track)
9. [Credential lifecycle](#9-credential-lifecycle)
10. [Generic coordination framework](#10-generic-coordination-framework)
11. [Public-leak takedown / reporting](#11-public-leak-takedown--reporting)
12. [Validation](#12-validation)
13. [Custom remediation workflows (the organizational overlay)](#13-custom-remediation-workflows-the-organizational-overlay)

---

## 1. Principles

These claims are load-bearing. Every later section is downstream of one or more of them; the architectural choices in §§ 2–4 are direct consequences.

1. **Rotation is necessary but not sufficient.** A rotated credential is dead — that is what stops the attack. But the *cost* of getting from "credential is live in production" to "credential is rotated" is rarely a click. Coordination across systems, owners, and change-management processes can dwarf the technical rotation step. The agent's job is to acknowledge this cost, not paper over it.

2. **Public vs internal-private exposure are different incident types** — not different urgencies of the same incident. A public leak is scraped within minutes; the credential is burned regardless of what the developer does next. An internal-private leak has a finite, auditable set of cloners; force-pushing a fix is sometimes the right call. The history-rewrite playbook applies to one; the scrape-window framing applies to the other. Collapsing them produces wrong advice for at least one of the two.

3. **The agent's first job is triage, not action.** Driver mode (walking the user through revoke / regenerate / update-callers) is opt-in. The agent always asks who owns the credential and what it unlocks before assuming it can drive a rotation that may not be the developer's to drive. Honest "you don't own this, file a ticket with X" beats wrong "click this button now."

4. **Blast radius is orthogonal to exposure.** A credential leaked publicly might be a throwaway sandbox key (one click). A credential leaked only in a private repo might unlock production payment infrastructure (multi-team migration). The "where it leaked" question and the "what it unlocks" question both matter; one does not substitute for the other.

5. **History rewrite rarely earns its complexity publicly; sometimes it does privately with audited clones.** In public repos, mirrors / archives / caches / search indexes already hold the credential. Rewriting history forces a break across every consumer with no recovery benefit. In private repos with a finite known set of cloners, force-pushing + coordinated re-clone is viable when policy demands it.

6. **Friction is preferable to false confidence.** Three triage questions are more friction than one. The agent asks all three anyway, because the four deliverable shapes (§ 3) are materially different and using the wrong shape produces wrong advice. Friction is recoverable; wrong advice that the user follows is not.

7. **Validity sets urgency, not the plan — it never lets you skip triage.** A `valid` finding (the credential is still live) raises priority, but it does **not** answer ownership or blast radius, and it does **not** license jumping past triage to a generic "rotate it" plan. The four axes (§ 2) still select the deliverable mode. If anything, validity cuts the other way: a *valid* credential wired into production-critical systems is the most dangerous thing to rotate blind — that is exactly the Coordination case (own + production blast, § 3), where rotation is a sequenced, dependency-mapped, supervised rollout that can take a live system down if rushed, not a click. Rotation is never the definitive answer on its own; *how* it is staged is decided by the triage answers. "Several incidents came back valid, so I'll skip to a rotation plan" is the canonical failure this principle exists to prevent.

---

## 2. The four triage axes

The agent must know all four axes before producing a deliverable. Three of them require user input in context-poor implementations; higher-context implementations may answer some from data (see [Implementation profiles](#4-implementation-profiles)).

| Axis | Range | Default acquisition |
|---|---|---|
| Detection context | post-leak · off-repo (pre-leak does not occur — the incident already exists) | Free — fixed to post-leak; the only question is public-facing vs internal-private vs off-repo, answered from incident data |
| Exposure | public-facing · internal-private | Derived from incident data (`public_exposure`, the internal/public tool family); asked only when ambiguous |
| Ownership | the developer has rotation authority · another team owns it | Asked |
| Blast radius | sandbox · shared dev · production-critical | Asked |

### Why three questions, not one

Collapsing exposure / ownership / blast radius into a single "can you just do this?" question loses information needed to produce the right escalation artifact. "You don't own this" produces a *ticket template addressed to the owning team*. "You own it but it's coupled to production" produces a *rotation runbook with dependency-mapping and a change-ticket draft*. Same answer to "can you just do this?" (no), entirely different deliverables. The agent asks all three, once per finding, before dispatching.

### Detection context is free

Every incident reaching this skill is post-leak by definition, so detection context is fixed — there is no hook to read. Dispatch is between the post-leak public-facing, post-leak internal-private, and off-repo tracks, and is answered from incident data (`public_exposure`, `source_criticality`, source type) rather than asked (see [Tracks](#6-post-leak--public-facing-track) onward).

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
| **Driver** | own + sandbox or shared-dev blast (any exposure) | Walkthrough: revoke → regenerate → update-callers → verify, with the type-specific mechanics sourced per [§ 9](#9-credential-lifecycle). |
| **Coordination** | own + production blast | Rotation runbook starting with a **dependency-mapping step**: enumerate consumers, plan a sequenced rollout, draft the change ticket. Not "click this now" — "treat this as a small project." Uses the framework in [§ 10](#10-generic-coordination-framework). |
| **Escalation** | corp-owned (any blast / any exposure) | Ticket template (incident type, exposure timeline, files affected, what's known about ownership) addressed to the owning team. The agent's job is handoff, not execution. |
| **Containment** | corp-owned + production blast + **public** exposure | The worst case. **Explicit branch up front:** *does your org have a security on-call rotation or IR team?* Yes → handoff template + step back. No → self-driven IR checklist (treat credential as burned, hunt for anomalous usage in service logs, document the exposure timeline, escalate to leadership). |

### Parallel action: public-leak takedown

Whenever exposure is public-facing, the agent surfaces GitGuardian's takedown / public-source reporting path as a parallel action, independent of which deliverable mode is producing the main artifact. **Takedown does not replace rotation** — the credential is already burned. Takedown slows secondary scrapes (search engines de-index, archive sites are notified) and creates an audit trail. See [§ 11](#11-public-leak-takedown--reporting).

### Triage the whole finding set first

Take in the *complete* set of findings before selecting any mode — do not start remediating on the first hit. A single scan typically returns many findings, and the same credential value often appears across multiple files, commits, or artifacts. Collapse those into one credential first: **one credential is one rotation, even if it leaked in five places.** Triage then runs once over the deduplicated set, so blast radius and ownership are assessed per credential rather than re-litigated per occurrence. Mode selection (below) happens only after the full set is known.

### One credential → one mode

The four modes do not stack. Each distinct credential produces exactly one main deliverable (driver, coordination, escalation, or containment) plus, when public, the parallel takedown surfacing. The triage answers in § 2 select the mode; they do not combine into a richer hybrid.

### Validity does not select a mode

Mode selection runs on ownership × blast radius (plus exposure for the public worst case) — **never on validity.** A `valid` result does not collapse to "driver, just rotate"; it only raises how urgently the selected mode is worked. A valid + production-critical + owned credential is still Coordination, not a fast-tracked Driver rotation. Resist the shortcut "the incidents are valid, so the plan is obvious" — validity is settled, the plan is not, and skipping the ownership and blast-radius questions because a key is live produces exactly the wrong-shape deliverable § 2 exists to prevent.

---

## 4. Implementation profiles

The doctrine is the universal contract; profiles describe how each implementation honors it. A new implementation adds a column. When a workspace has a configured custom remediation workflow, it overlays every profile and becomes the spine of the deliverable — see [§ 13](#13-custom-remediation-workflows-the-organizational-overlay).

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

## 5. Pre-leak track — not applicable here

A secret incident is, by definition, already detected and recorded by the GitGuardian platform — it has propagated past the point any pre-leak hook could intercept. The pre-leak track (file-edit / pre-commit / pre-push interception, where rotation is *not* required) therefore does not arise in incident triage, and its content is intentionally omitted from this tailored doctrine.

If a finding genuinely has not propagated yet — caught while editing, staging, or pushing — it is not an incident, and the pre-leak flow lives in the `scan-secrets` and `install-hooks` skills. When in doubt about whether a secret has propagated, assume it has and dispatch to the post-leak tracks below.

(Section number retained so the post-leak / internal-private / off-repo / lifecycle anchors stay aligned with the `scan-secrets` sibling doctrine.)

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

## 9. Credential lifecycle

The decisions below are the same for every secret type. The mechanics are not, and this doctrine does not carry them: the revoke and regenerate paths, the consumer-inventory commands, and the verification calls come from the workspace's custom workflow ([§ 13](#13-custom-remediation-workflows-the-organizational-overlay)) first, the GitGuardian Developer MCP server when it is connected, and the vendor's current documentation at use time. State an unknown instead of inventing a command or a console path.

For an exposed credential (post-leak or off-repo tracks, [§§ 6–8](#6-post-leak--public-facing-track)), act on its current state:

| Current state | Action |
|---|---|
| Present at any relevant branch tip | Replace the hardcoded value with the approved injection mechanism (environment variable, secrets manager, workload identity), then invalidate the exposed value. Include non-default branches. |
| History only, still used at runtime | Keep the injection code; replace the runtime value, update every consumer, then invalidate the exposed value. |
| History only, no longer needed | Verify revocation or expiry; revoke if still usable. Do not manufacture a replacement. |
| Verified revoked or expired | Finish cleanup, investigation, and prevention. No replacement exists solely to satisfy a checklist. |

Absence from branch tips does not establish runtime state: deployed releases and active configuration may still use the value. Moving the same leaked value into a vault does not invalidate it.

Before Driver or Coordination mode, establish six facts for the type at hand, from the sources above: what the credential authorizes, where it is revoked, where it is regenerated, where it is commonly wired in (env vars, secrets-manager entries, CI configs, IaC, dotfiles), how to enumerate its consumers and their owners ([§ 10 steps 2–3](#10-generic-coordination-framework)), and how to confirm the old value is dead and the new one works ([§ 12](#12-validation)).

---

## 10. Generic coordination framework

Used by [Coordination mode](#3-the-four-deliverable-modes) (own + production blast) to structure the rotation as a project rather than a click. [§ 9](#9-credential-lifecycle) says where the type-specific commands for steps 2–3 come from.

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

---

## 11. Public-leak takedown / reporting

When exposure is public-facing, the agent surfaces takedown as a **parallel action** alongside the main deliverable. Takedown does not replace rotation; the credential is already burned. What takedown buys:

- **Slowed secondary scrapes.** Once GitHub or the underlying host removes the artifact, search engines de-index over hours-to-days; some archive sites honor takedown requests.
- **Audit trail.** A documented takedown request supports later compliance / incident reporting.
- **Reduces casual reuse.** Lowers the chance that a non-targeted attacker stumbles on the credential by browsing the public repo before the search-engine cache expires.

### How the agent surfaces it

The agent provides the user with:

1. The URL of the public artifact (commit, gist, repo).
2. The takedown / reporting path appropriate for the host:
   - **Public GitHub:** request removal of sensitive data via GitHub Support per their published process. GitHub's docs at <https://docs.github.com/en/site-policy/content-removal-policies> document the standard removal request flow.
   - **HMSL match in the GitGuardian corpus:** the GitGuardian workspace surfaces the source(s); customers with appropriate plan tiers can request takedown via the GitGuardian platform. Consult the canonical guidance on docs.gitguardian.com for the current request path.
   - **Other public hosts** (gists, public GitLab, Pastebin, etc.): the agent links to the host's takedown contact.
3. A one-line reminder that this is *parallel* to rotation, not a substitute.

The doctrine does not specify the canonical GitGuardian takedown URL inline — that lives on `docs.gitguardian.com` and changes faster than this doc. The implementing skill or in-app agent links to the current canonical page.

---

## 12. Validation

Every mode ends with verification. Without it, the agent does not know whether the remediation actually worked.

### Universal validation

- **Re-scan the affected artifact.** `ggshield secret scan path <files-or-paths> --json` for file / path findings; `ggshield secret scan repo . --json` for repo-scope findings. The secret should no longer appear. If it does, the remediation didn't reach every consumer or the in-place fix was incomplete.

### Mode-specific validation

| Mode | Additional validation |
|---|---|
| Driver | Confirm the old credential is dead by exercising it deliberately (a service-specific check sourced per [§ 9](#9-credential-lifecycle), e.g., `aws sts get-caller-identity` with the old key → expect failure). |
| Coordination | Verify each consumer in the dependency map now uses the new credential, in the order defined by the rollout sequence. Spot-check failure logs for `Unauthorized` / `InvalidClientTokenId` style errors from missed consumers. |
| Escalation | The agent's deliverable is a ticket; the owning team validates. The agent surfaces "ask the owning team to confirm rotation completion and re-scan the affected artifact" as a follow-up. |
| Containment | Check for evidence of replay attempts: service logs / cloud audit trails (CloudTrail, GCP audit logs, Azure activity log) for the window from first public exposure to rotation. The agent does not drive forensics; it points at where to look and flags anomalies (anomalous source IPs, unusual API patterns, unexpected resource creation). |

### When validation fails

If the re-scan still finds the secret: the fix didn't propagate. Re-enter the relevant track (most often the original detection context's track) with the now-known consumer that wasn't updated. If a forensic check reveals replay activity: escalate per the org's IR process; this is no longer a remediation problem.

---

## 13. Custom remediation workflows (the organizational overlay)

> **Which touchpoint this skill uses.** A custom remediation workflow is configured *per touchpoint* — Incident page, Pre-commit, Pre-push, Pre-receive (the four tabs under the dashboard's Remediation workflow settings). This skill operates post-leak on already-detected incidents, so it consumes the **Incident page** touchpoint, fetched via `get_remediation_workflow`. The Pre-commit / Pre-push / Pre-receive touchpoints are pre-leak and are surfaced by ggshield directly in its CLI output (ggshield ≥ 1.30.0); they belong to the pre-leak scanning surface (`scan-secrets` / `install-hooks`), whose doctrine carries the parallel §13 for that channel.

A GitGuardian workspace can configure a **custom remediation workflow**: customer-authored, ordered remediation guidance the security team wants followed when a secret is detected. The Incident-page touchpoint is shown in the dashboard and fetchable over MCP as an ordered list of steps. When one is configured, it — not the doctrine — is the spine of the deliverable.

### How to fetch it, and when the overlay applies

Call `get_remediation_workflow` (read-only, `incidents:read`) once when entering remediation (the "drive the fix" step). The tool wraps the API response under a top-level `workflow` key — the fields below live at `workflow.*` (e.g. `workflow.id`, `workflow.steps`):

- `account_id`
- `steps[]` — **ordered**; each step is `{ title (required), description?, link? }`, where `link` is `{ text, url }`. **`steps` is always present — the default workflow has steps too.**
- `id`, `created_at`, `updated_at` — **present only when a custom workflow is configured; omitted for the default workflow.**

#### The gate: `id` presence, and nothing else

**Gate custom-vs-default on the presence of `workflow.id`. Never infer "custom" from the existence, count, wording, or richness of `steps`.** The default workflow ships a full, plausible-looking `steps[]` (it may even read like bespoke security guidance) — steps prove nothing. Only `id` (with `created_at` / `updated_at`) marks a workspace-configured custom workflow.

- **`workflow.id` present → custom workflow → the overlay applies.** Render the steps verbatim as the spine (this section).
- **`workflow.id` absent → GitGuardian default workflow → no overlay, and the default steps are discarded.** Do **not** render, quote, or use them as scaffolding. Drive end-to-end from the doctrine as in [§§ 6–12](#6-post-leak--public-facing-track), exactly as if the tool had returned nothing. The default `steps[]` are GitGuardian's generic placeholder, not workspace-authored guidance — they add nothing the doctrine does not already cover more completely, so the doctrine is the deliverable in full.
- **Tool absent** (older ggmcp, or the token lacks `incidents:read`) → same as the default case: doctrine drives end-to-end, the same graceful-degradation pattern as the absent write tools. Do not block remediation on it.

**Never** describe a no-`id` result as "custom", "configured by your workspace", or "your organization's remediation workflow". That is the default, and mislabeling it misleads the user into thinking their security team authored guidance they did not.

#### Announce the branch you took

State the gate decision explicitly before composing the deliverable, so the user (and any tester) can see which path was chosen:

- custom: *"`get_remediation_workflow` returned `id: <n>` → custom workflow → I'll follow your workspace's steps as the spine."*
- default: *"`get_remediation_workflow` returned no `id` → GitGuardian's default workflow → I'll set it aside and drive the remediation from the doctrine."*

#### Touchpoint caveat when returning the default

`get_remediation_workflow` returns **only the Incident-page touchpoint**. A workspace can have custom steps saved on the Pre-commit / Pre-push / Pre-receive tabs while the Incident-page tab is still the default — those pre-leak messages do **not** appear here (they surface via the ggshield CLI). So when you announce the default, add: *"note this reads only the Incident-page workflow; any custom Pre-commit/Pre-push/Pre-receive messages your workspace configured surface through ggshield, not here."* This stops a tester who configured a different tab from concluding the fetch is broken.

### Precedence — customer workflow is the spine, doctrine fills the blanks

The customer's ordered steps are authoritative. They are followed verbatim, in order, as the top-level structure of the deliverable. The doctrine demotes from "the plan" to two supporting roles:

1. **The knowledge bank behind each step** — the credential-lifecycle decisions ([§ 9](#9-credential-lifecycle)), dependency mapping ([§ 10](#10-generic-coordination-framework)), and verification ([§ 12](#12-validation)) that make a terse customer step concrete.
2. **The gap-filler** — anything the customer left unsaid that the doctrine considers important.

The doctrine never reorders, removes, or overrides a customer step.

### Rendering — literal numbered steps

Reproduce the customer's steps as their own numbered list, matching what they see in the dashboard (render each `link` as its `text` → `url`). Nest the operationalizing doctrine detail **under** the relevant step. Example: a workspace whose workflow is

> 1. Notify #security-incidents in Slack
> 2. Rotate the credential
> 3. File a ServiceNow change ticket
> 4. Confirm rotation with the platform team

renders as those four literal steps, with the [§ 9](#9-credential-lifecycle) revoke → regenerate → update-callers mechanics, the [§ 10](#10-generic-coordination-framework) dependency map, and the [§ 12](#12-validation) verification nested under step 2, and the [§ 10](#10-generic-coordination-framework) step-6 change-ticket fields offered under step 3.

### Triage still runs — to calibrate fill depth, not structure

Assess the four axes ([§ 2](#2-the-four-triage-axes)) per credential exactly as before. They no longer select a top-level mode or track; instead they decide **how much** doctrine depth to pour under each customer step. A sandbox key under a "rotate" step gets a one-line revoke/regenerate; a valid production-critical credential pulls the full Coordination dependency-map and sequenced rollout ([§§ 3](#3-the-four-deliverable-modes), [10](#10-generic-coordination-framework)) — nested under that same "rotate" step. Validity still sets urgency, never the plan ([principle 7](#1-principles)).

### Filling the blanks

- **Terse step** → enrich it underneath with the relevant doctrine detail.
- **Doctrine considers something important that no customer step covers** — most commonly post-rotation verification ([§ 12](#12-validation)), sometimes rotation itself — → the agent MAY add it as a clearly-labeled supplement ("Not in your workflow, but recommended: …"), at its discretion. It is *added*, never substituted for a customer step.

### When a customer step looks risky

Because the customer workflow wins, the agent still follows the step. It MAY attach a brief doctrine caveat as a fill-in. Example: a "scrub git history" step on a public leak → follow it, and note that mirrors, forks, caches, and search indexes retain copies ([§ 6](#6-post-leak--public-facing-track)) and that rotation is what actually stops the attack. Inform, do not override.

### Profiles

- **Open-source `triage-incidents` skill (this repo):** fetches via `get_remediation_workflow`; degrades to doctrine-drives when the tool or scope is absent.
- **In-app agent:** has the configured workflow natively; applies the same spine-and-fill model.
