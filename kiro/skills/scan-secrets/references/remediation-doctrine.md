# Remediation framework

Apply this framework to ggshield findings. Read it before remediation advice; retry incomplete reads in smaller ranges and stop the plan if it remains unavailable.

## Contents

1. [Principles](#1-principles)
2. [The four triage axes](#2-the-four-triage-axes)
3. [The four deliverable modes](#3-the-four-deliverable-modes)
4. [Implementation profiles](#4-implementation-profiles)
5. [Pre-leak track](#5-pre-leak-track)
6. [Post-leak / public-facing track](#6-post-leak--public-facing-track)
7. [Post-leak / internal-private track](#7-post-leak--internal-private-track)
8. [Off-repo exposure track](#8-off-repo-exposure-track)
9. [Credential lifecycle](#9-credential-lifecycle)
10. [Generic coordination framework](#10-generic-coordination-framework)
11. [Public-leak takedown / reporting](#11-public-leak-takedown--reporting)
12. [Validation](#12-validation)
13. [Custom remediation workflows (the organizational overlay)](#13-custom-remediation-workflows-the-organizational-overlay)

## 1. Principles

- Treat real credentials in any commit history, including unpushed commits, or in any detected incident as exposed. This is conservative handling, not proof of misuse. Only otherwise-unexposed, uncommitted changes qualify for the pre-leak track.
- Assess exposure, authority and blast radius independently. Private exposure can still affect production; a live credential does not identify its owner or make an unsupervised rotation safe.
- Remediation includes invalidation, safe consumer cutover, source cleanup, investigation and prevention. Removing a literal or moving the same leaked value into a vault does not invalidate it.
- Use the company's required actors, approvals and workflow. Match the deliverable to the user's authority and operational dependencies; do not assume permission from assignment or console access.

## 2. The four triage axes

Collect the complete finding set and group occurrences by credential before planning. Keep identifiers, locations, evidence sources, confirmed facts and pending questions together; never reproduce raw credentials.

| Axis | Establish | Why it matters |
|---|---|---|
| Detection context | Uncommitted/unexposed, committed or incident, and repository, hosted artifact or local profile | Selects cleanup and investigation surfaces. |
| Exposure | Who could read every known occurrence and copy; public, confirmed private or unconstrained | Selects urgency and the public/private track. |
| Ownership | Credential owner, revocation authority, required approvers; source owner when different | Determines who may act and who receives the handoff. |
| Blast radius | Privileges, affected resources, running consumers and dependencies; sandbox, shared development or production | Determines operational impact and coordination needs. |

Obtain facts from available evidence; ask only what remains unknown. If exposure, authority or blast radius is missing, ask grouped questions and wait. Give no provisional plan or guessed priority order. Validity, assignment and source criticality do not answer these questions. Discover relevant branch tips and runtime use; state coverage gaps.

### Set priority after triage

Use validity, severity and exposure signals to select findings for investigation; set remediation priority from the confirmed axes. Prioritize active misuse and uncontrolled access to consequential resources. Public exposure raises urgency; production privileges and dependent consumers raise impact. A valid sandbox credential does not automatically outrank an unknown-validity production exposure. Explain each priority using the evidence and revisit it when facts change. Verified invalidation can lower containment urgency while cleanup and investigation remain open.

## 3. The four deliverable modes

Choose one main deliverable per credential. Coordinate related credentials and run cleanup/investigation in parallel where appropriate. Mode selects the artifact and responsible actor; validity changes urgency, not authority.

| Mode | Select when | Produce |
|---|---|---|
| **Driver** | Authorized owner; sandbox/shared development with limited dependencies | A direct walkthrough with invalidation, any needed replacement, cleanup and checks. |
| **Coordination** | Authorized owner; production or dependencies require a staged change | A dependency map, assigned rollout sequence, change record, stop/recovery criteria and per-consumer validation. Use §10. |
| **Escalation** | Another owner or approval chain must perform the change | A handoff addressed to that owner: exposure timeline, affected resources and locations, requested actions, urgency and acceptance evidence. |
| **Containment** | Another owner controls a publicly exposed production credential | Establish whether security on-call/IR is available. If so, prepare its handoff; otherwise identify the accountable owner and provide a bounded containment/investigation checklist without assuming new authority. |

Evidence of active compromise warrants security/IR involvement in any track. Draft communications and tickets; send or change external records only with the required authorization. Public-source takedown is a parallel action, not another remediation mode.

## 4. Implementation profiles

The same decisions apply with different amounts of context. Use evidence actually available to the agent; do not infer capabilities or permissions from its deployment location.

| Profile | Use available context | Confirm what it cannot establish |
|---|---|---|
| Local coding agent | Scan/hook output, repository state, supplied runtime facts | Readership beyond the checkout, authority, consumers and change constraints. |
| Incident-connected agent | Incident occurrences, exposure evidence, assignment and company workflow | Assignment is not revocation authority; incident category is not exposure; source importance is not runtime impact. |
| Agent with service/ownership integrations | Verified service, dependency and owner records | Record provenance and gaps; resolve stale or conflicting records with responsible owners. |

This skill uses the local coding profile. Use ggshield output and repository evidence first, then ask for missing organizational context.

## 5. Pre-leak track

For a confirmed uncommitted, otherwise-unexposed value, remove hardcoding, use approved credential injection and re-scan before committing. Revocation is unnecessary. A pre-push finding already in a commit belongs to an exposed track, even if never pushed; the hook name does not override the credential's actual history.

## 6. Post-leak / public-facing track

Treat any public occurrence as public exposure, even when the incident or primary repository is internal. Unconstrained or unknown readership warrants potentially-public handling. Retain the incident ID's original tool family.

After triage, select the mode and arrange prompt owner-led containment or invalidation. Run leak-window investigation and public-source cleanup/reporting in parallel. Coordinate production changes explicitly; public urgency does not grant the reporting user another team's authority. History rewriting cannot recover copies or replace invalidation. If requested or company-required, apply the coordinated cleanup checks in §7.

## 7. Post-leak / internal-private track

Confirm the read path, including integrations, shared artifacts, mirrors and backups. Private exposure remains exposure; arrange invalidation and investigate use. A constrained read path permits controlled coordination, while privilege, production impact or evidence of misuse can still demand urgent response. Reclassify if a public copy appears; do not equate every external integration with public access.

History rewriting is optional cleanup only when requested or company-required. Coordinate affected readers and copies using host evidence and owner confirmation. Work in a disposable copy; verify tool behavior, intended changes, preserved content and scan results before publication.

## 8. Off-repo exposure track

Distinguish hosted artifacts from local profiles. For logs, chat, tickets or registry artifacts, establish readership and retention and involve the source owner in removal or access restriction. For local files or profiles, establish who controls the environment, who can read it, and where copies or backups go. Neither git commands nor a workstation-compromise assumption fit every off-repo finding.

Credential authority and source-cleanup authority may belong to different people. Assign each action separately and hand off work outside the user's authority. Apply public/private exposure handling to the actual readership. Remove unintended persistence and prevent its return; a credential's intended presence in an approved runtime store is not itself a cleanup target.

For an off-repo scan finding, establish whether the value was exposed or is intentionally stored for runtime use. Do not infer public exposure or require rotation solely because a file is outside git.

## 9. Credential lifecycle

Use these decisions for every secret type. Obtain missing invalidation mechanics and supported tests from company guidance, current official documentation or installed help. State unknowns instead of inventing commands.

| Current state | Action |
|---|---|
| Present at any relevant branch tip | Replace hardcoding with approved credential injection and invalidate the exposed value. Include non-default branches. |
| History only, still used at runtime | Preserve correct injection code; replace the exposed runtime value, update consumers and invalidate it. |
| History only, no longer needed | Verify revocation/expiry; revoke if still usable. Do not manufacture a replacement. |
| Verified revoked/expired | Finish cleanup, investigation and prevention; no replacement solely to satisfy a checklist. |

Absence from branch tips does not establish runtime state: deployed releases and active configuration may still use the value. Use the approved environment-variable, vault or identity mechanism. Propose one if missing and add a dependency only if needed.

## 10. Generic coordination framework

Use this framework to turn operational dependencies into assigned work. For each action record its owner, prerequisite, deadline/status and acceptance evidence. Company steps in §13 remain the top-level sequence.

1. **Map stores and consumers.** Locate active configurations, deployed versions and runtime readers. Identify shared dependencies and gaps; source cleanup alone is not a consumer inventory.
2. **Assign owners and approvals.** Name the credential owner, each consumer/source owner and the person coordinating the change. Resolve authority gaps before execution.
3. **Determine cutover constraints.** Establish supported invalidation/replacement behavior, whether access survives invalidation, and whether an overlap is possible and acceptable. Do not assume overlap is safe for a compromised credential; any exception needs an accountable owner, a deadline and monitoring.
4. **Sequence the change.** Order replacement, consumer updates and invalidation by company requirements, urgency and impact. Assign waves or a coordinated cut; specify health checks, stop conditions and owner-approved recovery that does not restore compromised access. Active abuse may require immediate containment with an accepted service interruption.
5. **Draft the change record and communications.** Include scope, exposure timeline, dependency map, actions/owners, approvals, timing, recovery and validation. Flag audiences and channels for the user; do not send messages without authorization.
6. **Track completion.** Record each consumer's cutover evidence, old-access rejection, cleanup and investigation. Keep blockers and pending owner actions visible; handing off a ticket is not verified remediation. Flag follow-up prevention or incident review for the responsible owner.

## 11. Public-leak takedown / reporting

For each known public artifact, give its location, source owner and current host/company reporting path. Prepare removal or access-restriction requests and track their status under the required authorization. Preserve sanitized incident evidence before cleanup. Takedown limits continued exposure; it cannot retrieve existing copies and must not delay or substitute for invalidation.

## 12. Validation

For every exposed credential, include these checks or place them under the corresponding company steps:

- **Credential:** verify old-credential rejection wherever accepted and required replacement-consumer success with intended permissions. Use fresh tests, not cached or alternate credentials; provider status alone is insufficient. Confirm expiry from trusted evidence and assess access that survives invalidation.
- **Cleanup:** check affected branch tips and active configurations, and re-scan changed artifacts. Record revoked values deliberately retained in history separately.
- **Investigation:** name the audit source and exposure window; record findings or an assigned pending action. Escalate evidence of misuse.
- **Prevention:** identify what stops the credential being stored or emitted again and how the change will be checked.

Driver mode records direct check results. Coordination requires evidence for every mapped consumer. Escalation and Containment require acknowledgement from responsible owners and their completion evidence; a prepared handoff alone does not close the incident. Failed checks reopen the relevant action. Report blocked or unverified work explicitly.

For unknown/unverifiable validity, offer the user-run HMSL handoff in [interpreting results](interpreting-results.md#hmsl-follow-up-for-unverifiable-findings).

## 13. Custom remediation workflows (the organizational overlay)

Use the workspace remediation message returned in ggshield hook output as primary guidance. If none is supplied, apply this framework; do not invent a company workflow.

Preserve customer steps verbatim, including order, named actors, approvals and supplied links. Put implementation details, dependencies and verification under the corresponding step. Label additional requirements as doctrine supplements. The axes and modes calibrate the work; they do not replace the customer's structure.

Personal access does not override named actors. Require explicit delegation or an approved workflow change to alter responsibilities. If a required step creates unresolved risk or cannot be performed, explain the conflict and obtain the workflow owner's decision; do not silently reorder, omit or waive it.
