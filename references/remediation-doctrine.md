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
