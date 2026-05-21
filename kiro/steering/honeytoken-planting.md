---
name: honeytoken-planting
description: Where to plant `ggshield` honeytokens for highest signal — example configs (`.env.example`), pre-publication open-source repos, internal wikis (Confluence / Notion), deploy scripts and CI configs, archived repos, container images and public artifacts. Includes naming and description conventions, response when a honeytoken fires (alert investigation, hunt for adjacent leaks), and ongoing maintenance. Load when generating a honeytoken via `ggshield honeytoken create` or `create-with-context`, when a honeytoken alert fires on the dashboard, or when planning where to plant decoys.
---

# Honeytoken Planting Strategy

Heavy reference for the `ggshield` power. Covers where to plant honeytokens for highest signal, naming and description conventions, what happens when one fires, and how to respond to an alert.

A honeytoken is only as useful as the place it sits. This file is the planting playbook.

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

## What NOT to do

- **Don't plant in active code paths.** If a code path actually executes against the credential, you'll trigger your own honeytoken. Plant in *referenced-but-not-executed* surfaces (example files, docs, archived code, deploy scripts that point at a non-existent bucket).
- **Don't plant the same honeytoken in multiple places.** When it fires, you'll lose the ability to identify which location was compromised.
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
