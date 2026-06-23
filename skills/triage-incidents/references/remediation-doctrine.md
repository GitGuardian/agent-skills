# GitGuardian Remediation Doctrine

> **Status:** draft (pre-1.0)
> **Audience:** the `triage-incidents` skill, and any GitGuardian agent or human building an incident-remediation flow — open-source agent skills, in-app agent, internal tooling, security teams.
> **Scope:** what to do when a leaked credential is found. Agent-side companion to the customer-facing IR guidance on docs.gitguardian.com.
> **Detection context:** post-leak only. Incidents reaching this skill are already detected by the GitGuardian platform; the pre-leak track does not apply and is intentionally omitted (see § 5). This is a tailored sibling of the `scan-secrets` doctrine — kept structurally diffable against it; the only divergence is the omitted pre-leak track.

When a credential is found leaking, the agent's first job is not to act — it is to know enough to act well. This doctrine prescribes what the agent must know before producing a deliverable, what shapes a deliverable can take, and how to dispatch across the lifecycle stages where a leaked credential can be discovered. The same logic drives every GitGuardian agent: the open-source skills shipped from this repo, the in-app agent inside the GitGuardian product, and future profiles (SecOps integrations, autonomous remediation).

## Contents

This file is the router for the whole doctrine. Every section is listed below in order;
links resolve in-file for the universal contract (§§ 1–4, 9.0, 10–12) and to a sibling
reference file for the lifecycle tracks (§§ 5–8) and the per-secret-type worked examples
(§ 9.1 onward). Section numbering is preserved across the split, so a `§ N` cross-reference
anywhere in the doctrine points to the same place regardless of which file it lives in (and
stays diffable against the `scan-secrets` sibling doctrine; the only divergence is § 5).

1. [Principles](#1-principles)
2. [The four triage axes](#2-the-four-triage-axes)
3. [The four deliverable modes](#3-the-four-deliverable-modes)
4. [Implementation profiles](#4-implementation-profiles)
5. [Pre-leak track — not applicable here](remediation-lifecycle-tracks.md#5-pre-leak-track--not-applicable-here)
6. [Post-leak / public-facing track](remediation-lifecycle-tracks.md#6-post-leak--public-facing-track)
7. [Post-leak / internal-private track](remediation-lifecycle-tracks.md#7-post-leak--internal-private-track)
8. [Off-repo exposure track](remediation-lifecycle-tracks.md#8-off-repo-exposure-track)
9. [Per-secret-type appendix](#9-per-secret-type-appendix)
    - [9.0 Schema](#90-schema)
    - [Self-expiring credentials — triage modifier](#self-expiring-credentials--confirm-expiry-before-rotating)
    - [9.1 AWS access keys](remediation-cloud-keys.md#91-aws-access-keys)
    - [9.2 GitHub personal access tokens](remediation-saas-tokens.md#92-github-personal-access-tokens)
    - [9.3 Generic API key](remediation-saas-tokens.md#93-generic-api-key)
    - [9.4 Database connection URLs](remediation-keys-and-dbs.md#94-database-connection-urls)
    - [9.5 Private keys (RSA / EC / SSH)](remediation-keys-and-dbs.md#95-private-keys-rsa--ec--ssh)
    - [9.6 Stripe API keys](remediation-saas-tokens.md#96-stripe-api-keys)
    - [9.7 Slack incoming webhooks](remediation-saas-tokens.md#97-slack-incoming-webhooks)
    - [9.8 GCP service account JSON](remediation-cloud-keys.md#98-gcp-service-account-json)
    - [9.9 Azure connection strings](remediation-cloud-keys.md#99-azure-connection-strings)
    - [9.10 OAuth refresh tokens](remediation-saas-tokens.md#910-oauth-refresh-tokens)
    - [9.11 Symmetric signing / shared secrets](remediation-keys-and-dbs.md#911-symmetric-signing--shared-secrets)
    - [9.12 Vendorless passwords](remediation-keys-and-dbs.md#912-vendorless-passwords)
10. [Generic coordination framework](#10-generic-coordination-framework)
11. [Public-leak takedown / reporting](#11-public-leak-takedown--reporting)
12. [Validation](#12-validation)

Sibling reference files, each one hop from the triage-incidents `SKILL.md`:
[`remediation-lifecycle-tracks.md`](remediation-lifecycle-tracks.md) (§§ 5–8; § 5 pre-leak is a
not-applicable stub here), [`remediation-cloud-keys.md`](remediation-cloud-keys.md),
[`remediation-saas-tokens.md`](remediation-saas-tokens.md), and
[`remediation-keys-and-dbs.md`](remediation-keys-and-dbs.md) (§ 9 worked examples).
The § 9.0 schema below is the template each family file fills in.

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
| Detection context | post-leak · off-repo (pre-leak does not occur — the incident already exists) | Free — fixed to post-leak; the only question is public-facing vs internal-private vs off-repo, answered from incident data |
| Exposure | public-facing · internal-private | Derived from incident data (`public_exposure`, the internal/public tool family); asked only when ambiguous |
| Ownership | the developer has rotation authority · another team owns it | Asked |
| Blast radius | sandbox · shared dev · production-critical | Asked |

### Why three questions, not one

Collapsing exposure / ownership / blast radius into a single "can you just do this?" question loses information needed to produce the right escalation artifact. "You don't own this" produces a *ticket template addressed to the owning team*. "You own it but it's coupled to production" produces a *rotation runbook with dependency-mapping and a change-ticket draft*. Same answer to "can you just do this?" (no), entirely different deliverables. The agent asks all three, once per finding, before dispatching.

### Detection context is free

Every incident reaching this skill is post-leak by definition, so detection context is fixed — there is no hook to read. Dispatch is between the post-leak public-facing, post-leak internal-private, and off-repo tracks, and is answered from incident data (`public_exposure`, `source_criticality`, source type) rather than asked (see [Tracks](remediation-lifecycle-tracks.md#6-post-leak--public-facing-track) onward).

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

### Triage the whole finding set first

Take in the *complete* set of findings before selecting any mode — do not start remediating on the first hit. A single scan typically returns many findings, and the same credential value often appears across multiple files, commits, or artifacts. Collapse those into one credential first: **one credential is one rotation, even if it leaked in five places.** Triage then runs once over the deduplicated set, so blast radius and ownership are assessed per credential rather than re-litigated per occurrence. Mode selection (below) happens only after the full set is known.

### One credential → one mode

The four modes do not stack. Each distinct credential produces exactly one main deliverable (driver, coordination, escalation, or containment) plus, when public, the parallel takedown surfacing. The triage answers in § 2 select the mode; they do not combine into a richer hybrid.

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

## 9. Per-secret-type appendix

This appendix is the only section that's mostly invariant across implementations — rotating an AWS key is the same job whether the in-app agent or the open-source skill drives it. The doctrine ships twelve worked examples plus a schema for the long tail. The worked examples now live in three credential-family sibling files — cloud keys ([`remediation-cloud-keys.md`](remediation-cloud-keys.md)), SaaS/API tokens ([`remediation-saas-tokens.md`](remediation-saas-tokens.md)), DB URLs / keys / passwords ([`remediation-keys-and-dbs.md`](remediation-keys-and-dbs.md)); the §9.0 schema below is the shared template. The worked examples cover credential *archetypes*, not every detector — for any type not catalogued, fill the §9.0 schema from vendor docs.

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


### Self-expiring credentials — confirm expiry before rotating

Before applying any entry below, check whether the credential *expires on its own*: AWS STS / session tokens, OIDC tokens (GitHub Actions, GitLab CI, Workload Identity Federation), short-lived OAuth *access* tokens (distinct from the refresh tokens in [§ 9.10](remediation-saas-tokens.md#910-oauth-refresh-tokens)), and Kubernetes ServiceAccount tokens with a bound TTL. For these the credential is frequently **already dead by the time the finding surfaces**, and rotation is moot. When the credential self-expires, the deliverable shifts:

1. **Confirm it has expired** — or force-expire it where the issuer allows (revoke the STS session, delete the bound K8s token). A still-valid short-lived token is treated like any other live credential until expiry is confirmed.
2. **Investigate the leak window** — for the interval the token was both valid *and* exposed, check the issuer's audit log for use from unexpected IPs. This is the containment-mode forensic check ([§ 12](#12-validation)), applied even when no rotation is needed.
3. **Fix the issuance pattern** — a self-expiring credential found *at rest* in a repo, image, or config means something is persisting a credential designed to be transient. That pattern is itself the finding: replace the stored token with on-demand issuance (assume-role, OIDC federation, projected SA token) so the next one can't leak the same way.

If the credential does not self-expire, ignore this note and proceed with the relevant entry.

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
| Driver | Confirm the old credential is dead by exercising it deliberately (a service-specific check from [§ 9](#9-per-secret-type-appendix), e.g., `aws sts get-caller-identity` with the old key → expect failure). |
| Coordination | Verify each consumer in the dependency map now uses the new credential, in the order defined by the rollout sequence. Spot-check failure logs for `Unauthorized` / `InvalidClientTokenId` style errors from missed consumers. |
| Escalation | The agent's deliverable is a ticket; the owning team validates. The agent surfaces "ask the owning team to confirm rotation completion and re-scan the affected artifact" as a follow-up. |
| Containment | Check for evidence of replay attempts: service logs / cloud audit trails (CloudTrail, GCP audit logs, Azure activity log) for the window from first public exposure to rotation. The agent does not drive forensics; it points at where to look and flags anomalies (anomalous source IPs, unusual API patterns, unexpected resource creation). |

### When validation fails

If the re-scan still finds the secret: the fix didn't propagate. Re-enter the relevant track (most often the original detection context's track) with the now-known consumer that wasn't updated. If a forensic check reveals replay activity: escalate per the org's IR process; this is no longer a remediation problem.
