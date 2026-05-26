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
