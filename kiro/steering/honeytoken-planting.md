---
name: honeytoken-planting
description: Where to plant `ggshield` honeytokens for highest signal — example configs (`.env.example`), pre-publication open-source repos, internal wikis (Confluence / Notion), deploy scripts and CI configs, archived repos, container images and public artifacts. Includes naming and description conventions, response when a honeytoken fires (alert investigation, hunt for adjacent leaks), and ongoing maintenance. Load when generating a honeytoken via `ggshield honeytoken create` or `create-with-context`, when a honeytoken alert fires on the dashboard, or when planning where to plant decoys.
---

# Honeytoken Planting Strategy

Heavy reference for the `ggshield` power. Covers where to plant honeytokens for highest signal, naming and description conventions, what happens when one fires, and how to respond to an alert.

A honeytoken is only as useful as the place it sits. This file is the planting playbook.

## Dual audience: real to attackers, decoy to defenders

Every honeytoken has **two readers** at the same time, and the planting choice must work for both:

- **The attacker** scanning the repo for valid credentials — must find the surrounding context convincing enough to copy the credential and try to use it. They are skimming for high-entropy strings near `aws-sdk`, `boto3`, `S3Client`, `getCredentials`, `.env` filenames, etc. They are *not* reading comments or studying code structure.
- **An engineer on the defending team** browsing the repo for legitimate work — must immediately recognize the file as a decoy and **never import, instantiate, or execute** it. If a teammate accidentally `import`s a honeytoken-containing module and calls its function in real code, the honeytoken fires on every CI run.

Both audiences read the same file. You optimize the placement, naming, and surrounding content so that the realism the attacker needs and the inertness the defender needs are not in conflict. Concretely:

- **Real to the attacker:** the credentials look real (they are — issued by GitGuardian), the file looks plausible (a config, a service, a deploy script), the name suggests something useful (`s3-backup`, `billing-config`, `deploy-keys`).
- **Decoy to the team:** the file's *location* is outside your production import graph (test fixtures, archived folders, non-default branches, wiki pages), its *name* doesn't appear in any working code path's resolver, and its *entry point* is either non-importable (data file) or visibly inert (early throw, missing imports, deprecated comment block).

Concrete tactics for keeping the dual audience honest are in **Avoiding self-triggering** below; the GitGuardian dashboard's [Deployment jobs](https://docs.gitguardian.com/honeytoken/deploy-honeytokens/deployment-jobs.md) feature implements this principle at scale by opening pull requests that don't have to be merged — the honeytoken is "deployed" the moment the PR exists, but your team's main branch never imports it.

## Where to plant (in order of typical signal)

### 1. Example configuration files

`.env.example`, `config.sample.yml`, `settings.template.json`, `secrets.example.toml`, and the like.

**Why this works:** developers copy these to make a real config. When someone leaks the example to a public repo (and they do — search GitHub for `.env.example` and count the real AWS keys), the honeytoken fires before any real credential is involved.

**How to plant:** use `ggshield honeytoken create` (bare form), drop the access key + secret pair into the example file alongside the placeholder names. Add a comment that looks innocuous, e.g. `# fill in your own credentials`.

```bash
ggshield honeytoken create --type AWS \
  --name "env-example-readonly-replica-2026-05" \
  --description "planted in .env.example for service-foo, monitoring leaks of the template"
```

### 2. Pre-publication audit of soon-to-be-public repos

A repo that's about to be open-sourced is a once-in-its-lifetime attractive surface. Forks happen fast, and the git history is exposed forever.

**How to plant:** add one honeytoken to a *committed* file (deploy script, README example, integration test fixture). Wait until the repo has been public for a few weeks before you forget about it — by then forks exist, search engines have indexed it, and any alert directly identifies the leak surface.

**Critical:** plant *before* publication, then audit the alert feed after publication. Don't try to plant after the fact — you've already lost the window.

### 3. Internal wikis, runbooks, and documentation

Confluence, Notion, internal docs sites, README runbooks. These often contain real credentials that team members reference. They also leak — via account takeover, contractor exfiltration, accidental "share with anyone with the link" mistakes.

**How to plant:** generate the bare honeytoken and paste it into a credentials block in the runbook. Format it to match the surrounding real credentials so an attacker scraping the page can't tell the difference.

### 4. Deploy scripts, Helm charts, CI/CD config

`deploy.sh`, `kubernetes/*.yaml`, `.github/workflows/*.yml`, Terraform `tfvars` files (committed ones — please don't commit real `tfvars`).

**How to plant:** use `ggshield honeytoken create-with-context` with the right `--language` flag (`bash`, `yaml`, `python`, `terraform`). The wrapper makes the decoy look like a real config block:

```bash
ggshield honeytoken create-with-context --type AWS \
  --name "deploy-script-s3-backup-2026-05" \
  --description "planted in deploy.sh as the backup-bucket uploader" \
  --language bash \
  -o ./deploy.sh
```

### 5. Archived / abandoned repositories

Repos that are no longer actively developed but still exist (private archived, internal-only, or "dead but never deleted"). These get ignored by routine scanning, ignored by access reviews, and forgotten about — making them attacker gold.

**How to plant:** drop a honeytoken in a plausible-looking config file, commit, push to the archived repo's default branch. If the repo is *truly* dead nobody will see the commit; if someone's still poking around, you'll know.

### 6. Container images and public artifacts

Docker images on Docker Hub, GHCR, internal registries. Public S3 buckets. Released `.zip` artifacts.

**How to plant:** include the honeytoken in a config file baked into the image at build time. Use `create-with-context` with `--language dockerfile` or the relevant language for the embedded config.

## Avoiding self-triggering (when planting in code files)

`ggshield honeytoken create-with-context` generates a fully-functional-looking module. For example, with `--language typescript` and an `-o services/AwsBackupService.ts`, it can produce a file that imports `aws-sdk`, instantiates an `S3` client with the honeytoken credentials, and exports something like `uploadToS3Bucket`. That is exactly what makes the decoy convincing to an attacker — and exactly what creates a risk that a teammate later types `import { uploadToS3Bucket } from './services/AwsBackupService'` in real code, calls it, and fires the honeytoken from your own CI pipeline.

The fix is not to write less-realistic code. It is to plant the realistic-looking file **where your production import graph cannot reach it**. Pick one of these tactics:

### Prefer non-importable surfaces when possible

Generic file types — `.env`, `.yaml`, `.json`, `.csv`, `.txt`, plus markdown runbooks, Notion / Confluence pages, and README snippets — can't be `import`-ed or `require`-d by code. The credentials still look real to an attacker scanning the file. Use the bare `ggshield honeytoken create` (without `-o` pointing at code) for these surfaces. This is also the strategy the GitGuardian dashboard's Deployment jobs feature uses by default ("Generic" contexts: `.env`, `.json`, `.yaml`, `.csv`, `.txt`).

### If a code file is required, isolate it from your import graph

Place the file under a path that your production build, dev runtime, and test runner do **not** resolve from:

- `tests/fixtures/`, `tests/data/`, `__fixtures__/` — test data, not imported by application code
- `examples/`, `samples/`, `docs/snippets/` — documentation surfaces, not in the build
- `archived/`, `legacy/`, `deprecated/`, `_old/` — explicitly retired code paths
- A **non-default branch** that is never merged. The file is visible to attackers cloning all refs (including PR branches), but absent from your team's working tree on `main`. This mirrors what GitGuardian's Deployment jobs do automatically — they open a PR, and the honeytoken is "deployed" the moment the PR is created, regardless of whether you merge.

Inside one of those locations, the file's name can still be plausible — `AwsBackupService.ts` in `tests/fixtures/aws/` reads "test fixture for AWS code" to a teammate and "valid AWS credentials in a real-looking module" to an attacker.

### Make the entry point obviously non-functional to a reader

Even when isolation is in place, belt-and-braces is cheap. Tactics that don't degrade attacker-realism (they're skimming for credentials, not studying code):

- An early `throw new Error('Deprecated — replaced by ...')` at the top of the exported function — the credential string above it still parses.
- Import statements that don't resolve (`import { LegacyClient } from '@internal/legacy-aws-deprecated'`) — type-checker will fail before anything runs, and an honest engineer notices.
- A header comment block that names this as a honeytoken to defenders: e.g. `// GG-HONEYTOKEN — do not import. Tripwire for the <surface> threat model. See <internal-registry-link>.` Attackers harvesting credentials never read it; teammates immediately understand. If you adopt a magic-string convention like `GG-HONEYTOKEN`, a one-line CI grep (`! git grep -l GG-HONEYTOKEN -- '*.ts' '*.js' '*.py' | grep -vE '^(tests/|archived/|examples/)'`) catches accidental imports before they merge.

### Use the GitGuardian dashboard's Deployment jobs feature at scale

If you are deploying honeytokens across many repositories, the manual `ggshield honeytoken create-with-context` workflow doesn't scale — and you'll want the safety properties above without re-deriving them per repo. The GitGuardian dashboard's [Deployment jobs](https://docs.gitguardian.com/honeytoken/deploy-honeytokens/deployment-jobs.md) feature (Business plan, GitHub + GitLab) opens pull requests across selected repositories with one honeytoken each. Key safety properties built in:

- The honeytoken is considered deployed the moment the PR is created — **the PR does not need to be merged**. Your team's main branches stay clean; attackers cloning all refs still find the honeytoken in the open PR.
- Each PR carries a unique honeytoken, so triggers are traceable to a specific repository.
- "Generic" contexts (`.env`, `.json`, `.yaml`, `.csv`, `.txt`) are non-importable by default; "Dynamic" contexts (AI-generated, language-specific) are still placed in PR-only files.

When suggesting honeytoken deployment to a user with many repos to seed, recommend the dashboard's Deployment jobs feature rather than scripting `ggshield honeytoken` calls per-repo.

## What NOT to do

- **Don't plant in an importable code path on your default branch.** This is the most common foot-gun. `ggshield honeytoken create-with-context -o services/Foo.ts` (or any path your production build resolves) produces a file that looks plausible to attackers — and that any teammate may legitimately import and execute, firing your own honeytoken from CI. Use a non-importable surface (`.env`, `.yaml`, `.json`, `.csv`, `.txt`, runbook), an isolated directory (`tests/fixtures/`, `examples/`, `archived/`), or a non-default branch instead. See the "Avoiding self-triggering" section above.
- **Don't plant in active execution paths.** Beyond imports: anything that actually executes against the credential at runtime will trigger your honeytoken. Plant in *referenced-but-not-executed* surfaces — example files, docs, archived code, deploy scripts that point at a non-existent bucket, fixtures the production runtime doesn't touch.
- **Don't plant the same honeytoken in multiple places.** When it fires, you'll lose the ability to identify which location was compromised. Generate a new honeytoken (cheap) per planting location.
- **Don't plant without a description.** Months later when an alert fires, you'll have no idea what `ggshield-a1b2c3` was supposed to be guarding.
- **Don't plant without recording where you planted it.** Keep a list (internal wiki, ticket, vault note). The honeytoken alert tells you *something* was tripped — your record tells you *where*.

## Naming and description conventions

**Name** — short, mechanical, includes surface + date:

```
env-example-billing-service-2026-05
deploy-script-staging-eks-2026-05
confluence-runbook-postgres-prod-2026-05
archive-repo-legacy-payments-2026-05
```

**Description** — ≤250 chars, prose, includes:
- *Where* it was planted (file path, repo, page URL)
- *Why* (the threat model being monitored)
- *Who* planted it (so future-you knows who to ask)
- *When* (date, even though GitGuardian stores creation time — handy for grep)

Example:
```
planted in github.com/acme/billing-service .env.example by mathieu on 2026-05-21
to detect public leaks of the env-template
```

## Alert response — what to do when a honeytoken fires

A GitGuardian alert means **someone tried to authenticate with the decoy credential**. This is high-signal: there is no benign reason for that authentication attempt.

1. **Read the alert immediately.** Check the dashboard for the honeytoken's name and description — that tells you which surface was tripped.
2. **Locate the planting record.** Internal wiki / vault note / ticket. Confirm the location matches the description.
3. **Investigate the surface.** Who has access to the location? Has anything been published, forked, copied recently? Check access logs (Confluence, Notion, GitHub access events, S3 bucket logs).
4. **Do not rotate the honeytoken.** Honeytokens are designed to fire repeatedly — leave the trap armed. If the attacker tries again, you get more signal.
5. **Hunt for adjacent credentials.** If the attacker found the honeytoken, they may have also found *real* credentials in the same location. Rotate any real credentials that lived alongside the decoy.
6. **Decide whether to plant more.** A confirmed compromise on one surface often means other surfaces in the same system are also exposed. Consider planting additional honeytokens with finer-grained naming to triangulate the leak source.

## Maintenance

- Keep a centralized list of planted honeytokens (name → location → date → owner). The GitGuardian dashboard shows the tokens, but the *planting context* lives with you.
- When a planted surface is deleted (repo deleted, wiki page removed), retire the honeytoken in the dashboard to keep the list clean.
- Periodically audit: are the honeytokens still in the locations the records say they're in? Surfaces drift — config files get rewritten, docs get reorganized.
