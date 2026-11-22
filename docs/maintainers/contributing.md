# Contributing: adding skills, slash commands, and references

## Adding a new skill

1. **Confirm the capability is reachable through a GitGuardian tool the agent can drive.** Most skills wrap the `ggshield` CLI — run `ggshield --help` and the relevant subcommand `--help` to confirm. Some capabilities are dashboard/platform features with no CLI surface (incident triage, assignment, resolution); those are reachable through the GitGuardian Developer MCP server (ggmcp) and belong here too — `triage-incidents` is the reference example. What does not belong: a capability with neither a CLI nor an MCP path the agent can actually invoke.
2. **Pick a verb-noun name.** `scan-machine`, `check-hmsl`, `install-hooks`, etc. No `ggshield-` prefix.
3. **Create `skills/<name>/SKILL.md`** with frontmatter:
   ```yaml
   ---
   name: <name>
   description: Use when <concrete triggers>. Keep to ~50–60 words.
   ---
   ```
4. **Follow the SKILL.md section order** (Overview → When to Use → Onboarding → Commands → Best Practices → Troubleshooting).
5. **Move long-form into `skills/<name>/references/<topic>.md`** if any section exceeds ~150 lines.
6. **Point at `references/gitguardian-platform.md`** for auth/scope recovery and instance URLs — don't re-document them.
7. **Update `AGENTS.md`** (Skills index table) and the `README.md` (What the skills do section + Repository layout block).
8. **Validate locally:**
   ```bash
   for f in $(find . -name '*.json' -not -path './.git/*'); do jq empty "$f"; done
   for f in skills/*/SKILL.md; do head -1 "$f" | grep -q '^---$' && grep -q '^name:' "$f" && grep -q '^description:' "$f"; done
   ggshield secret scan path -r -y . --json
   ```

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

## Checking skills against the ggmcp tool contracts

The `mcp-contracts` job in `validate.yml` checks every ggmcp tool, argument, enum value and output field named in `skills/*/SKILL.md`, `skills/*/references/**` and `skills/*/evals/**` (Markdown and JSON) against the tool contracts of the pinned ggmcp version. It reports each mismatch as `file:line` with the nearest valid name. `kiro/` is not checked.

The pin lives in `package.json`:

```json
"ggmcp": { "version": "0.8.0", "commit": "<commit of tag v0.8.0>" }
```

ggmcp is not on PyPI (the PyPI name `gg-mcp` belongs to an unrelated project), so CI installs it from the pinned commit of its GitHub tag, and fails if the tag and the commit disagree.

**Run it locally:**

```bash
python3 -m venv /tmp/ggmcp
/tmp/ggmcp/bin/pip install --index-url https://pypi.org/simple \
  "ggmcp @ git+https://github.com/GitGuardian/ggmcp.git@$(jq -r .ggmcp.commit package.json)"
/tmp/ggmcp/bin/python -I scripts/dump-mcp-contracts.py > /tmp/tool-contracts.json
npm run check:mcp-contracts -- /tmp/tool-contracts.json
```

The dump builds the server in-process and lists its tools: no API key, no GitGuardian API call. When ggmcp publishes `tool-contracts.json` with its releases (GitGuardian/ggmcp#249), CI can download that file instead.

**Bump the pin** when a new ggmcp release ships: set `version`, set `commit` to `git ls-remote https://github.com/GitGuardian/ggmcp.git "refs/tags/v<version>^{}"` (or the plain tag line for a lightweight tag), update the README Requirements line, and let the job report what the skills got wrong.

**What it reads.** Extraction is conservative: a name is checked only when its context ties it to one tool.

- A backticked tool name is a tool reference. A backticked name shaped like a tool (a tool verb followed by words from tool names, such as `list_incidents`) that is not a tool, argument or output field is reported as an unknown tool.
- A Markdown table with a column headed Arguments, Parameters, Inputs or Filters is a parameter table, bound to the tool in the row (or, without one, to the single tool named in the paragraph above the table). Backticked values in parentheses after an argument, or after `` `arg`: ``, are enum values. A column headed Returns, Output or Fields lists output fields.
- In a sentence or table cell naming exactly one tool: `` `arg: value` ``, `` `arg=value` ``, `` `tool` with `arg` `` and "pass `` `arg` ``" name arguments; backticked names after "returns" name output fields. In evals JSON, bare tool names and "with some_arg" count too.
- An output field is reported only when the schema disproves it: a name that may sit inside an open object (such as `id` inside `get_remediation_workflow`'s `workflow`) passes, unless it is listed beside a real top-level field.
- Fenced code blocks and code fixtures under `evals/files/` (scripts, `.env`) are not read, so REST calls in them are not mistaken for MCP calls.

**False positives** go in `skills/<skill>/evals/mcp-contracts-allow.json`:

```json
{
  "allow": [
    { "name": "list_incidents", "tool": null, "file": "references/history.md", "reason": "Quotes the pre-0.8 name on purpose" }
  ]
}
```

`name` (the reported identifier) and `reason` are required. `tool` limits the entry to findings about that tool, `file` to one file (a path suffix). Prefer rewording the skill so the context is unambiguous; use the allow-list only when the text is right as written.

## Future scaling

When the skill library crosses ~5 skills:

- **Adopt a router-pattern + `SKILL_TREE.md` at repo root.** Three router skills always visible in agent metadata; everything else hidden via a `disable-model-invocation: true` frontmatter flag and loaded on demand when a router points to it. Keeps startup metadata at a few hundred tokens instead of growing linearly with the catalog.
- **Add a CI validation step** that regenerates `SKILL_TREE.md` from frontmatter and validates cross-references between skills, the README layout block, and per-skill `references/` pointers.
