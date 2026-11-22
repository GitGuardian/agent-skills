# Contributing: adding skills, slash commands, and references

## Adding a new skill

1. **Confirm the capability is reachable through a GitGuardian tool the agent can drive.** Most skills wrap the `ggshield` CLI — run `ggshield --help` and the relevant subcommand `--help` to confirm. Some capabilities are dashboard/platform features with no CLI surface (incident triage, assignment, resolution); those are reachable through the GitGuardian Developer MCP server (ggmcp) and belong here too — `triage-incidents` is the reference example. What does not belong: a capability with neither a CLI nor an MCP path the agent can actually invoke.
2. **Pick a verb-noun name.** `scan-machine`, `check-hmsl`, `install-hooks`, etc. No `ggshield-` prefix.
3. **Create `skills/<name>/SKILL.md`** with frontmatter (rules in *Frontmatter `description:`*, *`metadata.command-handoff` and `metadata.version`* and *`license:` and `compatibility:`* in `AGENTS.md`):
   ```yaml
   ---
   name: <name>
   description: Use when <concrete triggers>. Keep to ~50–60 words.
   license: MIT
   compatibility: <what this skill needs, e.g. the ggshield version or the gg-mcp version and token scopes>
   metadata:
     version: "<current version>" # x-release-please-version
   ---
   ```
4. **Follow the SKILL.md section order** (Overview → When to Use → Onboarding → Commands → Best Practices → Troubleshooting). For an MCP-backed skill, Onboarding covers connecting and authenticating gg-mcp, and Commands lists the tools and the workflow instead of CLI invocations.
5. **Move long-form into `skills/<name>/references/<topic>.md`** if any section exceeds ~150 lines.
6. **Copy the shared references the skill needs into its own `references/`** — don't re-document them. `gitguardian-platform.md` (auth/scope recovery, instance URLs) applies to every skill; `ggshield-cli-setup.md` only to CLI-backed skills. See [Adding or editing a duplicated reference](#adding-or-editing-a-duplicated-reference).
7. **Write the evals** in `skills/<name>/evals/`: `evals.json` (behaviour cases with assertions), `trigger-eval.json` (a JSON array of `{"query", "should_trigger"}` objects, with near-miss prompts that belong to a sibling skill as negatives) and `targets.json`. See [`evals.md`](evals.md).
8. **Check every tool contract the skill names.** CLI-backed: `ggshield <subcommand> --help` against the version in `compatibility`. MCP-backed: see [MCP-backed skills](#mcp-backed-skills).
9. **Register the skill.** Update `AGENTS.md` (Skills index table and Slash commands table), the `README.md` (Skills and Commands section + Project Structure block), and add a `generic` extra-file entry for `skills/<name>/SKILL.md` to `release-please-config.json`. Do not add a copy under `kiro/`.
10. **Validate locally** with the same commands CI runs (`.github/workflows/validate.yml`, `sanity.yml`, `ggshield.yml`):
    ```bash
    for f in $(find . -type f -name '*.json' -not -path './node_modules/*'); do jq empty "$f"; done
    node scripts/check-skill-markdown.mjs
    for d in skills/*/; do skills-ref validate "$d"; done   # install: see distribution.md
    npm ci && npm test
    claude plugin validate .
    ggshield secret scan path -r -y .
    ```
    For an MCP-backed skill, also run the tool-contract check (below).
11. **Open the pull request** as described in [Opening the pull request](#opening-the-pull-request).

## MCP-backed skills

A skill that drives gg-mcp tools (`triage-incidents` is the reference) follows every rule above, plus these.

**Tool contracts come from the server, not from the REST docs.** The source of truth for a tool's name, arguments, enum values and output fields is the input and output schema that gg-mcp itself publishes for the version the skill declares in `compatibility`. Never derive them from `api.gitguardian.com/docs`. gg-mcp wraps the public API, but deliberately does not mirror it:

| REST API | gg-mcp |
|---|---|
| `creator_id`, `creator_api_token_id` | `mine` (a boolean: only what the current user created) |
| `per_page` | `page_size` (a gg-mcp change to accept both is in progress; write `page_size`) |
| `cursor` / `next` links read from the response | `next_arguments` in the result |
| one endpoint for internal and public incidents | a pair of tools, `*_internal_*` and `*_public_*`, with IDs that are not interchangeable |
| `show_token` and other caller-controlled flags | often fixed by the server and absent from the tool |

Example: `list_honeytokens` in gg-mcp 0.8.0 accepts `status`, `search`, `mine`, `ordering`, `page_size`, `cursor` and `get_all`, and returns `next_arguments`. It has no `show_token`, `creator_id`, `creator_api_token_id`, `per_page` or `next_cursor`, which are REST names. An agent that sends REST names to a tool gets a rejected call or, if the client drops the unknown argument, a silently different result.

**Dump and check the contracts locally.** `scripts/dump-mcp-contracts.py` builds the pinned gg-mcp in-process and writes every tool's input and output schema (no API key, no network call to GitGuardian); `scripts/check-mcp-contracts.mjs` checks the tool names, arguments, enum values and output fields in `skills/*/SKILL.md`, `references/` and `evals/` against that dump. The pin is the `ggmcp` key in `package.json`. Once the `mcp-contracts` check is in CI, the same check runs on every pull request:

```bash
python3 -m venv /tmp/ggmcp
/tmp/ggmcp/bin/pip install --index-url https://pypi.org/simple \
  "ggmcp @ git+https://github.com/GitGuardian/ggmcp.git@$(jq -r .ggmcp.commit package.json)"
/tmp/ggmcp/bin/python -I scripts/dump-mcp-contracts.py > /tmp/tool-contracts.json
npm run check:mcp-contracts -- /tmp/tool-contracts.json
```

Until those scripts are on `main`, read the schemas from a connected server (the tool list your MCP client shows, with each tool's input schema) for the version you declare, and say in the pull request which version you checked.

**Pagination.** List tools return `has_more`, `stop_reason` and `next_arguments`. To get the next page, call the same tool again with `next_arguments` exactly as given; do not build a cursor. `get_all: true` fetches several pages in one call up to a size or page limit, and `stop_reason` says which limit stopped it. A skill that reconciles or counts must page until `has_more` is false, or say that it stopped early.

**Scope hiding.** gg-mcp hides the tools the token's scopes do not allow. A missing tool means the token lacks a scope, not that the tool does not exist. The skill's Troubleshooting must say so and point at `get_my_identity`, which returns the token's scopes and the user's role. Put the scopes the skill needs in `compatibility` and in Prerequisites.

**Privacy mode.** With privacy mode on, the GitGuardian API replaces sensitive values (credentials, IP addresses, and similar) with `<GG>OBFUSCATED</GG>`. It is on when the request sends `X-Privacy-Mode: true`, or when the workspace enforces it for the caller's role, in which case the API ignores the header ([docs](https://docs.gitguardian.com/platform/security-data-privacy/privacy-mode)). gg-mcp sends the header on most calls and turns it off on honeytoken calls, but workspace enforcement still applies, and a REST call with a PAT gets the same masked response. A skill that reads a credential or any other sensitive value from the API must check for `<GG>OBFUSCATED</GG>` before using it, and stop with an explanation instead of using the marker as a value.

**Live eval harnesses.** Evals that need a sandbox workspace, a PAT, a Slack channel or other live resources keep only a `README.md` under `skills/<name>/evals/files/` in this repository. The README describes the procedure: what to seed, what to run, how to grade, how to tear down. The runnable scripts live in the internal skill package, where the internal eval tooling and CI run them. Outside contributors cannot run them without those resources, and the repository must not carry code that needs credentials to be useful.

## Opening the pull request

**Branch in the main repository.** Push your branch to `GitGuardian/agent-skills` and open the pull request from there. The required `secret-scan` check (`.github/workflows/ggshield.yml`) runs ggshield with the repository's `GITGUARDIAN_API_KEY` secret, and GitHub does not pass repository secrets to workflows triggered from a fork. A fork pull request fails that check and cannot merge. If you do not have write access, ask a maintainer for it or ask them to push your branch.

**First-time contributors.** GitHub holds the workflow runs of a first-time contributor until a maintainer approves them. If your checks show "waiting for approval", ask on the pull request.

**Title.** Use a Conventional Commit title. We squash-merge, so the pull request title becomes the commit on `main`, and Release Please reads it to choose the version bump: `feat:` is a minor, `fix:` a patch, `docs:`/`ci:`/`chore:` no bump. Skill content is the product, so a change to a `SKILL.md` or its `references/` is `feat:` or `fix:`, not `docs:`. See [`releasing.md`](releasing.md).

**Description.** Fill in `.github/PULL_REQUEST_TEMPLATE.md`. It must report:

- the evals you ran, on which model, and the results (per assertion, and precision and recall for the trigger eval);
- the local checks you ran, with any failure pasted;
- live tests, if any: which workspace or environment, which flows, the result;
- what you could not verify, and why.

The repository is public: no links to internal documents, tickets or chat threads in the description.

**Scope.** One skill per pull request. Fixes to other skills, shared references or tooling go in their own pull request.

**Ownership.** You own the pull request until it is ready to merge: watch the checks, fix what fails, answer and address review comments, and rebase on `main` when it moves. A maintainer merges.

## Adding a slash command

Every skill is automatically invokable as `/gitguardian:<skill-name>` — that's the slash command. **Do not** create a `commands/` directory or flat `commands/*.md` files; Anthropic now frames those as the legacy "skills as flat Markdown files" pattern and recommends `skills/<name>/SKILL.md` for all new work (see Critical structural rules in `distribution.md`).

To add a new slash invocation:
1. Add the skill (see [Adding a new skill](#adding-a-new-skill) above).
2. Phrase the skill's frontmatter `description:` so it reads cleanly as a slash-dropdown label — lead with the action verb, then list the auto-trigger conditions. The same string serves both audiences: humans browsing the dropdown and the model deciding when to auto-invoke.
3. Update the Slash commands table in `AGENTS.md` and the README's slash-command bullets to reference the new invocation.

## Adding or editing a duplicated reference

`ggshield-cli-setup.md` and `gitguardian-platform.md` are intentionally duplicated into every skill that links to them (see *Skills are self-contained* in `AGENTS.md`). When you edit one of these files, propagate the same edit to every other copy. Quick check:

```bash
for f in skills/*/references/ggshield-cli-setup.md; do shasum "$f"; done
for f in skills/*/references/gitguardian-platform.md; do shasum "$f"; done
```

All copies of a given file should share the same checksum after your edit. If you need a *new* duplicated reference (some content that genuinely applies to two or more skills), copy it into each consuming skill the same way.

`kiro/skills/` is a legacy copy of `skills/`, kept until the Kiro registry is repointed at the repo root. Kiro now installs from the root `plugin.json` and `skills/`. CI no longer checks that the two trees match, so you do not need to update `kiro/skills/` when you edit a skill.

## Future scaling

When the skill library crosses ~5 skills:

- **Adopt a router-pattern + `SKILL_TREE.md` at repo root.** Three router skills always visible in agent metadata; everything else hidden via a `disable-model-invocation: true` frontmatter flag and loaded on demand when a router points to it. Keeps startup metadata at a few hundred tokens instead of growing linearly with the catalog.
- **Add a CI validation step** that regenerates `SKILL_TREE.md` from frontmatter and validates cross-references between skills, the README layout block, and per-skill `references/` pointers.
