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
