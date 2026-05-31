# Versioning & releasing

We follow [Semantic Versioning](https://semver.org). The plugin is **pre-1.0** and stays pre-1.0 until the public surface is stable enough that a breaking change truly warrants a major bump.

## Source of truth

The plugin version lives in **eleven files** that must move together:

- `package.json` → `version`
- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`
- `.cursor-plugin/marketplace.json` → `metadata.version`
- `.codex-plugin/plugin.json` → `version`
- `skills/scan-secrets/SKILL.md` → `metadata.version` (via `# x-release-please-version` annotation)
- `skills/create-honeytokens/SKILL.md` → `metadata.version` (same)
- `skills/scan-machine/SKILL.md` → `metadata.version` (same)
- `skills/check-hmsl/SKILL.md` → `metadata.version` (same)
- `skills/install-git-hooks/SKILL.md` → `metadata.version` (same)

All eleven are registered in `release-please-config.json` (the manifests as `json` extra-files, the five SKILL.md as `generic`), so Release Please moves them in lockstep — never bump one by hand. Plus a matching Git tag (`v<major>.<minor>.<patch>`) and a GitHub Release. Tag format mirrors what [`ggmcp`](https://github.com/GitGuardian/ggmcp) uses (`tag_format = "v$version"` in its `pyproject.toml`), so the wider GitGuardian release surface stays consistent.

## When to bump

| Bump | Trigger |
|---|---|
| **patch** (`0.1.0 → 0.1.1`) | A bug fix — a `fix:` commit. Something that was supposed to work already and now does. (Pure docs/CI/chore changes are `docs:`/`ci:`/`chore:` and bump nothing at all.) |
| **minor** (`0.1.0 → 0.2.0`) | Any feature — a `feat:` commit. A new skill, a new slash command, a new MCP tool, a new capability, or a meaningful change to an existing skill's content (skill content is the product). **While pre-1.0, also covers breaking changes** — renames, restructures, removed surfaces (`feat!:`). Example: the `ggshield`-plugin → `gitguardian`-plugin rename was minor-bump material, not a major. |
| **major** (`0.x → 1.0.0`, then `1.x → 2.0.0`, …) | Reserved. The first `1.0.0` lands once: Cursor marketplace listing is approved and live, the GitGuardian public API integration ships, and we have enough usage data to be confident the public surface is stable. After 1.0, every breaking change becomes a major bump. |

The "while pre-1.0, breaking changes are minor" rule is explicit because SemVer leaves it ambiguous and reviewers will otherwise argue about it on each rename PR.

### Commit type → bump

Release Please decides the bump from Conventional Commit prefixes. We follow the SemVer default — **every `feat:` is a minor, every `fix:` is a patch** — and keep only the one pre-1.0 concession SemVer explicitly allows: breaking changes bump a minor instead of a major (`bump-minor-pre-major: true`) until we cut 1.0.

| You're shipping… | Prefix | Pre-1.0 result |
|---|---|---|
| A new skill / slash command / MCP tool / capability, or a meaningful change to a shipped skill | `feat:` | **minor** (`0.1.x → 0.2.0`) |
| A bug fix | `fix:` | patch (`0.1.x → 0.1.x+1`) |
| A breaking change — rename, restructure, removed surface | `feat!:` / `BREAKING CHANGE:` | minor (pre-1.0); becomes major after 1.0 |
| Maintainer docs, CI, internal refactor, chore | `docs:` / `ci:` / `refactor:` / `chore:` | no bump (still in changelog) |

No `!`-marker games: pre-1.0 the `!` means what it always means (a genuinely breaking change), and a plain additive `feat:` already gets the minor it deserves. We do **not** set `bump-patch-for-minor-pre-major` — leaving it at its default (`false`) is what keeps `feat:` mapped to minor.

**The lever is the squash-merge PR title, not the branch commits.** We squash-merge PRs, so Release Please only ever sees *one* commit per PR on `main` — and its message is the **PR title**, not whatever the individual branch commits were named. A branch full of `feat:` commits still lands as a patch if the PR title is `fix:`. So the right prefix has to be on the **PR title** (e.g. `feat: add triage-incidents skill` → minor). This is the trap that shipped `install-git-hooks` as the 0.1.7 patch under the old config: the work was a new skill, but the squash title didn't earn it a minor.

When you cross 1.0, flip `bump-minor-pre-major` to `false`; from then on `feat!:` becomes a major instead of a minor (`feat:` is already the minor). This section's pre-1.0 caveat then no longer applies.

## Release flow (automated via Release Please)

Releases are driven by [Release Please](https://github.com/googleapis/release-please). The flow is two-step: a release PR appears automatically; merging it cuts the release.

**1. A release PR opens automatically.** Every push to `main` triggers `.github/workflows/release.yml`. The action scans Conventional Commits since the last release tag, infers the next semver bump, and opens (or updates) a single PR titled `chore: release vX.Y.Z` containing:

- Version bumps in every file listed in `release-please-config.json` (currently: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, `.codex-plugin/plugin.json`). Bump every manifest in lockstep so the plugin surfaces can never drift.
- A `CHANGELOG.md` update with sections grouped by commit type (`Features` ← `feat:`, `Bug Fixes` ← `fix:`, etc.), each entry linked back to its commit.

The semver bump is driven by Conventional Commit prefixes, following the SemVer default:

| Commit type | Pre-1.0 bump | Post-1.0 bump |
|---|---|---|
| `feat:` | minor (0.1.0 → 0.2.0) | minor (1.0.0 → 1.1.0) |
| `fix:` | patch | patch |
| `feat!:` or `BREAKING CHANGE:` | minor (0.1.0 → 0.2.0) | major (1.0.0 → 2.0.0) |
| `chore:` / `docs:` / `ci:` / `refactor:` / `test:` | none (still appears in changelog) | none |

(Toggle: `bump-minor-pre-major: true` is the one pre-1.0 concession — it downgrades breaking changes from major to minor while we're in 0.x. `bump-patch-for-minor-pre-major` is left at its default `false`, so `feat:` maps to minor as SemVer intends. Flip `bump-minor-pre-major` to `false` once we cross 1.0.)

**Skill content is the product — use `feat:`, not `docs:`.** A `SKILL.md` (its `description`, `metadata`, body instructions, or `references/`) is what we ship to agents, so any change to it is a feature update and must use `feat:` (or `feat!:` for a breaking change) so Release Please cuts a version. Reserve `docs:` for repo/maintainer documentation that users never receive — `README.md`, `AGENTS.md`, `docs/maintainers/`, code comments. Rule of thumb: if the change reaches someone who installed the plugin, it is `feat:`/`fix:`, not `docs:`.

**2. Review the release PR, then merge.**

- Re-validate locally if you want: `claude plugin validate .` and `npm run test:sanity` against the release PR branch.
- Edit `CHANGELOG.md` in the release PR if the auto-generated wording needs polishing.
- Merging the release PR triggers the workflow again; this run sees the merged version bump, creates the `vX.Y.Z` git tag, and publishes the GitHub Release with the changelog as release notes.

**Auth caveat.** The default `GITHUB_TOKEN` is used. GitHub does not run workflows on PRs created by `github-actions[bot]` (safety against workflow loops), so CI does not auto-run on the release PR. To trigger CI on a release PR, either push an empty commit:

```bash
git commit --allow-empty -m "chore: trigger CI" && git push
```

…or run the relevant workflow manually from the Actions tab. If release cadence grows, swap the workflow to use a GitHub App or PAT (replace `${{ secrets.GITHUB_TOKEN }}` with the app/PAT token).

## What does NOT need a version bump

- New PR description rewrites
- AGENTS.md additions that don't change the user-facing plugin surface
- Comments, internal renames within a SKILL.md body
- Anything that wouldn't show up as a behavior change for someone running the installed plugin

If unsure, the test: *would a user who already installed the plugin notice this change after running `/plugin marketplace update`?* If no, it's a patch (or doesn't need its own release).
