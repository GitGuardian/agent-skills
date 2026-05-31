# Versioning & releasing

We follow [Semantic Versioning](https://semver.org). The plugin is **pre-1.0** and stays pre-1.0 until the public surface is stable enough that a breaking change truly warrants a major bump.

## Source of truth

The plugin version lives in **five files** that must move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`
- `.cursor-plugin/marketplace.json` → `metadata.version`
- `.codex-plugin/plugin.json` → `version`

Plus a matching Git tag (`v<major>.<minor>.<patch>`) and a GitHub Release. Tag format mirrors what [`ggmcp`](https://github.com/GitGuardian/ggmcp) uses (`tag_format = "v$version"` in its `pyproject.toml`), so the wider GitGuardian release surface stays consistent.

## When to bump

| Bump | Trigger |
|---|---|
| **patch** (`0.1.0 → 0.1.1`) | Doc fixes, typo corrections, internal cleanup, dependency bumps, README rewrites, CI tweaks — anything with no user-visible behavior change. |
| **minor** (`0.1.0 → 0.2.0`) | A new skill, a new slash command, a new MCP tool surfaced, a new manifest field that adds a capability. **While pre-1.0, also covers breaking changes** — renames, restructures, removed surfaces. Example: the `ggshield`-plugin → `gitguardian`-plugin rename was minor-bump material, not a major. |
| **major** (`0.x → 1.0.0`, then `1.x → 2.0.0`, …) | Reserved. The first `1.0.0` lands once: Cursor marketplace listing is approved and live, the GitGuardian public API integration ships, and we have enough usage data to be confident the public surface is stable. After 1.0, every breaking change becomes a major bump. |

The "while pre-1.0, breaking changes are minor" rule is explicit because SemVer leaves it ambiguous and reviewers will otherwise argue about it on each rename PR.

## Release flow (automated via Release Please)

Releases are driven by [Release Please](https://github.com/googleapis/release-please). The flow is two-step: a release PR appears automatically; merging it cuts the release.

**1. A release PR opens automatically.** Every push to `main` triggers `.github/workflows/release.yml`. The action scans Conventional Commits since the last release tag, infers the next semver bump, and opens (or updates) a single PR titled `chore: release vX.Y.Z` containing:

- Version bumps in every file listed in `release-please-config.json` (currently: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, `.codex-plugin/plugin.json`). Bump every manifest in lockstep so the plugin surfaces can never drift.
- A `CHANGELOG.md` update with sections grouped by commit type (`Features` ← `feat:`, `Bug Fixes` ← `fix:`, etc.), each entry linked back to its commit.

The semver bump is driven by Conventional Commit prefixes. Pre-1.0 the config is conservative:

| Commit type | Pre-1.0 bump | Post-1.0 bump |
|---|---|---|
| `feat:` | patch (0.1.0 → 0.1.1) | minor (1.0.0 → 1.1.0) |
| `fix:` | patch | patch |
| `feat!:` or `BREAKING CHANGE:` | minor (0.1.0 → 0.2.0) | major (1.0.0 → 2.0.0) |
| `chore:` / `docs:` / `ci:` / `refactor:` / `test:` | none (still appears in changelog) | none |

(Toggles: `bump-patch-for-minor-pre-major` and `bump-minor-pre-major`, both `true` in our config. Flip to `false` once we cross 1.0.)

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
