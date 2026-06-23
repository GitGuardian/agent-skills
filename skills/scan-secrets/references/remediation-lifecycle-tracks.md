# Remediation Lifecycle Tracks

> Sibling reference to [`remediation-doctrine.md`](remediation-doctrine.md). Loaded on demand
> once the detection context is known. Carries the four lifecycle tracks (§ 5–§ 8). The
> universal contract — principles, triage axes, deliverable modes, coordination, takedown,
> validation — lives in the core. Per-secret-type runbooks (§ 9) live in the family files
> linked from the core.

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

In every cell, surface the public-leak takedown action (see [§ 11](remediation-doctrine.md#11-public-leak-takedown--reporting)) as parallel — it does not replace rotation, but it slows secondary scrapes and creates an audit trail.

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
