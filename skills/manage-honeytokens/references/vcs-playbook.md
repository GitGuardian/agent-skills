# VCS Playbook — Repositories

Loaded on demand from `SKILL.md`. How to deploy, reconcile, rotate and retire honeytokens in
GitHub, GitLab, Bitbucket and Azure DevOps repositories through the host's API, with one design
goal: **invisible to the people who use the repository, unmissable for anything that scans it.**

As on every surface, `GET /v1/honeytokens/{id}/sources` lists the repositories and `files[]`
where the GitGuardian scanner found the token, so the registry and `/sources` cross-check each
other. Everything else in this file is about choosing a placement that attackers' tooling finds
and teammates never trip over.

## Who finds a honeytoken in a repository

A honeytoken in a repository is found by three kinds of reader, and the placement is chosen
against all three at once:

| Reader | What it looks at | What it does with an AWS key |
|---|---|---|
| **Attackers and their tooling** (trufflehog, gitleaks, custom greps on a cloned repo, leaked-code buyers) | every ref they can clone, full history, often `--all` | copy it, try `sts:GetCallerIdentity`, enumerate — **this is the trigger you want** |
| **The organisation's own scanners** (GitGuardian, GitHub secret scanning, GitLab secret detection, trufflehog or gitleaks in CI) | all branches and history (GitGuardian, GitHub), or whatever the CI job is pointed at | GitGuardian recognises its own honeytokens and links them to the token as a source. Scanners that *verify* keys (trufflehog by default) call AWS and **trigger the honeytoken themselves** |
| **Teammates** | the default branch at HEAD, in their editor and in code review | nothing, as long as they never see it; a pair that shows up in a file they edit gets "cleaned up" or, worse, used |

So the placement must be: a plain-text file reachable from a git ref (scanners clone refs, not
the web UI), containing both halves of the pair in the standard shape every detector matches,
and **not on the default branch at HEAD** (teammates live there).

## Placements, from most to least deceptive

The `placement` field of the deployment record takes one of these values.

### `history` — committed, then removed, on the default branch

Two commits on the default branch: one adds a plausible file with the credential pair, the next
removes it ("cleanup: drop stale backup profile"). At HEAD nothing is there; a teammate who
opens the tree never sees it. Every history-aware scanner (GitGuardian, GitHub secret scanning,
trufflehog, gitleaks, anyone running `git log -p` on a clone) finds it, because that is
exactly how real leaked credentials look: added by mistake, deleted later, still in history.

- **Best deception / scanner-reach ratio.** It also reads as the most credible leak an attacker
  can find.
- **Needs a merge policy that keeps history.** If the repository squash-merges, do the two
  commits directly on the default branch (needs push rights past branch protection) or as a
  merge commit; a squash collapses add+remove into nothing. Record `merge_policy` in the
  locator and verify the commit SHA is reachable from the default branch after the merge.
- **Cannot be cleaned without a history rewrite.** Retirement is revoke-only; the revoked pair
  stays in history and is harmless.
- Locator: `repo_url`, `branch` (default), `path`, `add_commit_sha`, `remove_commit_sha`.
- Verify: fetch `add_commit_sha` through the host API (commit still reachable), and expect
  `/sources` to list the repository with the path in `files[]` after the next scan.

### `pr` — an open pull request that is never merged

A branch `chore/<something-boring>` with one commit adding the file, and a pull request left
open (or closed without merging, branch kept). This is the model the dashboard's Deployment jobs
use: the token is live the moment the PR exists because `refs/pull/*` and the branch are part of
every `--all` clone, and the default branch never carries it.

- Visible to teammates only as one more stale PR; keep the title boring and add a label the team
  ignores (`wontfix`, `stale`). Do not request reviewers.
- Found by GitGuardian, GitHub secret scanning (all branches) and any attacker cloning refs.
  Missed by a CI scanner that only scans the default branch, which is fine: that scanner is not
  the attacker.
- Retirement is clean: close the PR **and delete the branch**; the objects become unreachable
  and are garbage-collected by the host.
- Locator: `repo_url`, `branch`, `path`, `commit_sha`, `pr_url`.

### `branch` — a long-lived non-default branch, no PR

Same as `pr` without the pull request: an `archive/2025-q3-migration` or `legacy/backup-jobs`
branch that nobody checks out. Slightly less visible than a PR (no entry in the PR list) and
slightly less found (no `refs/pull/*`). Use it when the repository's PR list is actively triaged.

### `archived` — the default branch of an archived repository

Archived repositories are read-only and rarely opened, which is exactly the inertness you want,
and they are a favourite of attackers because access reviews skip them. Unarchive, commit the
file to the default branch (or do a `history` placement), re-archive. Record `placement:
archived`; retirement means unarchive, remove, re-archive, or revoke-only.

### `tag` — a release tag or a published artifact

A tag pointing at a commit that carries the file (`v1.8.3-hotfix`), or the file inside a release
asset. Attackers downloading releases find it; teammates never do. Scanner reach is lower
(tags are cloned, release assets are not scanned by most tools). Use as a complement, not alone.

### What not to do

- **Not the default branch at HEAD** (`.env.example` on `main`, a fixture under `tests/`). Visible
  in every editor and code review; a teammate will remove it or try it. `create-honeytokens`
  covers the cases where that is acceptable (a repo about to be published, a template meant to
  be copied). The import-graph self-triggering tactics in that skill's planting strategy still
  apply whenever a code-shaped file is used.
- **Not encoded, split or obfuscated.** Base64, a key on one line and the secret in another
  file, or a secret in a comment block defeat detectors as much as attackers. Both halves within
  a few lines, standard key names, plain text.
- **Not in a binary, a lockfile or a minified bundle.** Detectors skip or mis-parse them.
- **Not the same token in two repositories.** A fork or a copy will happen on its own; when it
  does, `/sources` shows it and attribution is already lost. Mint per repository.

## The artifact

Use `POST /v1/honeytokens/with-context` with the repository's `project_extensions` (or
`ggshield honeytoken create-with-context`) to get a language-appropriate file, filename and
`suggested_commit_message`, then make it quieter than the generator does:

- A non-importable file beats a code file: `config/backup.env`, `deploy/legacy-backup.yaml`,
  `terraform/backup.auto.tfvars`, `scripts/snapshot-copy.cfg`. Attackers grep, they do not
  import. Standard shapes that every detector matches:

```dotenv
# legacy nightly snapshot copy -- remove after the cross-account role is live
AWS_ACCESS_KEY_ID=AKIA…
AWS_SECRET_ACCESS_KEY=…
AWS_DEFAULT_REGION=eu-west-1
S3_BUCKET=acme-db-backups-legacy
```

- Commit message and file name in the repository's own voice (copy the style of recent
  commits). The commit author is the integration or the user running the skill; do not
  impersonate a teammate.
- No trap vocabulary anywhere in the file, the commit, the branch or the PR.

## Deploying through the host API, not a local clone

Make the commits with the host's API (GitHub MCP server or `gh api`, GitLab MCP server or
`glab api`, Bitbucket and Azure DevOps REST). It keeps the credential pair off the operator's
machine, skips local pre-commit hooks (`ggshield` and others would flag the pair as a leak, which
it is designed to look like), and produces exactly the commits you want.

GitHub, `history` placement (two commits on the default branch):

```bash
gh api -X PUT "repos/$OWNER/$REPO/contents/$PATH" -f branch="$DEFAULT" \
  -f message="chore(backup): add legacy snapshot profile" -f content="$(base64 -w0 < artifact.env)"
# response .commit.sha -> add_commit_sha ; .content.sha -> blob sha for the delete
gh api -X DELETE "repos/$OWNER/$REPO/contents/$PATH" -f branch="$DEFAULT" \
  -f message="chore(backup): drop stale snapshot profile" -f sha="$BLOB_SHA"
# response .commit.sha -> remove_commit_sha
```

GitHub, `pr` placement: create the branch (`POST repos/.../git/refs` from the default branch
SHA), `PUT .../contents/...` on that branch, `gh pr create --base $DEFAULT --head $BRANCH
--title "chore(backup): legacy snapshot profile" --body "" --label stale`. Leave it open.

GitLab (`POST /projects/:id/repository/commits` with `actions: [{action: create|delete, ...}]`)
does the same in one call per commit. Bitbucket uses `POST /2.0/repositories/{ws}/{repo}/src`;
Azure DevOps `POST .../pushes` with `changeType: add|delete`.

Two host features will get in the way and should not be bypassed silently:

- **GitHub push protection** (and GitLab's equivalent) blocks a push that contains an AWS key
  pair. Expected: it proves the placement is scanner-visible. Either use the host's documented
  bypass for this one push with the reason "honeytoken deployment", or hand the deployment to
  the dashboard's Deployment jobs (Business plan, GitHub and GitLab) which open the PR server-
  side. Tell the user which one you did.
- **Branch protection** on the default branch stops the direct `history` placement. Fall back to
  `pr`, or to `history` through a merge-commit PR (never squash).

## Self-inflicted triggers

The organisation's own tooling will try the key. Plan for it before the first deployment:

- **GitGuardian** does not call AWS for its own honeytokens; it links the repository to the token
  as a source. No trigger.
- **trufflehog** (and any scanner with verification on) calls `sts:GetCallerIdentity`. Every CI
  run on that repository rings the token. Either run those scanners with verification off for
  AWS, or allowlist the CI egress IPs in the dashboard (events become `allowed`, no trigger),
  or accept the triggers and tag them. Decide with the user and write the decision in the
  deployment note.
- **AI coding agents** working in the repository may read the file and try the profile. Those
  are events a security team wants to see; label them (an IP rule or a note), do not suppress.
- **GitHub secret scanning on public repositories** reports AWS keys to AWS through the partner
  programme; AWS may quarantine the key. GitGuardian tags the token `publicly_exposed` and the
  events still arrive. This is the signal, not a malfunction.

## Reconcile, rotate, retire in a repository

**Reconcile** has two independent views here. `/sources` says where the scanner saw the token
(repository, `files[]`, `provider_metadata.archived`); the host API says whether the commit,
branch or PR still exists. Derive:

| `/sources` | Host | Verdict |
|---|---|---|
| lists the repo, path in `files[]` | commit / branch / PR present | in place |
| lists the repo | PR merged and squashed, or branch deleted | drifted: the ref is gone, the objects may linger until GC — treat as `write` (re-deploy) |
| lists more repositories than the registry | n/a | copied or forked: attribution lost, flag it; consider revoking and re-minting per repository |
| empty | present | not scanned yet (new deployment, or repository not integrated) — check the source is in the GitGuardian perimeter |
| empty | absent | removed; set `removed` |

**Rotate**: `history` — add+remove the new pair in two fresh commits; the old pair stays in
history, revoked. `pr` / `branch` — one more commit on the same branch replacing the pair (the
old pair stays in that branch's history; fine). Then verify through the host API and revoke the
old token. Expect `/sources` on the new token to catch up at the next scan.

**Retire**: `pr` / `branch` — close the PR and delete the branch, then revoke. `history`,
`archived`, `tag` — revoke only; state in the `REVOKED` note that the pair remains in history.
A history rewrite to purge a revoked honeytoken is never worth it.

## Many repositories

For a fleet on GitHub or GitLab with a Business plan, the dashboard's Deployment jobs remain the
lowest-effort option when they work: one token per repository, PR-only placement, no API scripting.
When they fail or the organisation needs `history` placement, this playbook through the host API
is the alternative: loop over the repository list, one mint and one deployment record each, batch
confirmation per ten repositories, and a summary table at the end with `/sources` catching up
over the following scans.
