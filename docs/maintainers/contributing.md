# Contributing: adding skills, slash commands, and references

## Adding a new skill

1. **Confirm the capability exists in `ggshield`.** Run `ggshield --help` and the relevant subcommand `--help`. If it's not in the CLI, this repo is not the right place — this repo wraps the CLI, not the dashboard.
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

## Future scaling

When the skill library crosses ~5 skills:

- **Adopt a router-pattern + `SKILL_TREE.md` at repo root.** Three router skills always visible in agent metadata; everything else hidden via a `disable-model-invocation: true` frontmatter flag and loaded on demand when a router points to it. Keeps startup metadata at a few hundred tokens instead of growing linearly with the catalog.
- **Add a CI validation step** that regenerates `SKILL_TREE.md` from frontmatter and validates cross-references between skills, the README layout block, and per-skill `references/` pointers.
