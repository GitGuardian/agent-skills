# Vaulting Doctrine (pass)

This reference expands the five-step migration flow in `SKILL.md` with full decision rules, consumer-coverage nuances, deletion hygiene, and verification doctrine, for the one backend this skill uses: GNU `pass`. Read it when SKILL.md routes here, not as an always-on document.

---

## 1. Leaked-first gate

Run this gate before every secret you intend to vault. Vaulting a leaked secret hides a value the attacker may already hold. The fix for a leaked secret is rotation, not vaulting.

**Trigger A — the file was ever committed to git.** If the file has any commit history, the value is in that history. If the repo was ever pushed or shared, that history is a leak.

```bash
git -C <repo> log --all --oneline -- <relative/path/to/file> | head
```

If this returns any output, treat the secret as potentially exposed. Do not vault it. Rotate first, then vault the rotated replacement.

**Trigger B — an HMSL hit from `scan-machine` or `check-hmsl`.** If a prior run flagged the secret with an HMSL match, the value has been seen leaking publicly. Burned regardless of git.

**The rule:**
- `git log` returns output -> ROTATE first, then vault the replacement.
- HMSL hit present -> ROTATE first, then vault the replacement.
- Neither fires -> proceed to vault.

The agent does not run rotation or history rewrites automatically. It routes the work: flag the gate condition, name the next skill (`scan-secrets` for rotation, `check-hmsl` for public-leak verification), and resume only after the user confirms rotation is complete.

---

## 2. What is vault-able vs. what should just be deleted

| Condition | Action |
|---|---|
| Live, in-use credential — the app needs it at runtime | Vault. |
| Dead, expired, or superseded — the service no longer accepts it | Delete in place. No point vaulting garbage. |
| Example, placeholder, or template value (`.env.example`, README snippet, comment) | Leave it. Not a real secret. |
| Default credential shipped out-of-box that should always be changed | Rotate first (the default is public knowledge), then vault. |
| Credential whose scope or owner is unknown | Pause. Clarify with the user before vaulting. |

---

## 3. The five-step flow, expanded

### Step 1 — Identify
Read the file to list variable KEYS and line numbers. Never read, echo, or surface values. If the user named files, work only those; do not crawl `$HOME`. Apply the section-2 decision table; skip dead/example keys; flag ambiguous ones.

### Step 2 — Leaked-first gate (per section 1)
For each live key, run `git log --all --oneline -- <file>` and check for an HMSL flag from this session. If either fires, stop that key, report the gate condition and next step, move on. Resume only after the user confirms rotation.

### Step 3 — Hand off the value move
Emit the `pass insert` stdin pipe (exact recipe in `pass-setup.md`) for the user to run. The agent authors it by file and key; never embeds the value. Use `<project>/<KEY>`. Confirm the insert succeeded (`pass ls <project>` shows the entry — without printing the value) before rewriting.

### Step 4 — Rewrite to a direnv reference
Add `export <KEY>=$(pass show <project>/<KEY>)` to the project `.envrc`, then `direnv allow`. One key at a time: rewrite, verify, next. For non-shell consumers, use the render-to-tempfile fallback in `pass-setup.md` (section 4 below covers which consumer needs which).

### Step 5 — Verify + delete plaintext
```bash
ggshield secret scan path <file>
```
The finding is cleared when ggshield reports no policy violations for that file. If it came from a machine scan, also:
```bash
ggshield machine scan --rescan                 # re-scan standard machine paths
ggshield machine scan <path> --rescan          # re-index one path
```
Then confirm the reference resolves non-empty without echoing it (section 5), and delete the plaintext line — or the whole `.env` once `.envrc` is authoritative. Default to deleting `.env`; suggest a committed `.env.example` of bare keys (no values) for onboarding. Add `.env` to `.gitignore`.

---

### Worked example — `.env` with `DATABASE_URL`, loaded by python-dotenv

**Scenario.** `.env` at the project root has `DATABASE_URL=<value-not-shown>`. A Python app calls `load_dotenv()`.

**Step 1 — Identify.** Agent reads `.env`, reports: line 2, key `DATABASE_URL`.

**Step 2 — Gate.** `git -C . log --all --oneline -- .env | head` -> empty (git-ignored, never committed). Gate passes.

**Step 3 — Hand off.** Agent emits (user runs):
```bash
sed -nE 's/^(export[[:space:]]+)?DATABASE_URL=//p' ".env" | sed -E 's/^"//; s/"$//' | tr -d '\n' \
  | pass insert -m -f "myproj/DATABASE_URL"
```

**Step 4 — Rewrite.** Add to `.envrc`:
```bash
export DATABASE_URL=$(pass show myproj/DATABASE_URL)
```
Then `direnv allow`. `direnv` exports `DATABASE_URL` into the environment; `load_dotenv()` finds nothing to load but the app reads `os.environ["DATABASE_URL"]` and it is present.

**Step 5 — Verify + delete.**
```bash
ggshield secret scan path .env       # expect: no findings
# confirm resolution without echoing (no `set -x` active):
direnv allow && [ -n "$DATABASE_URL" ] && echo "resolved: non-empty" || echo "ERROR: empty"
```
Then delete the plaintext line (or the whole `.env`), and ensure `.env` is in `.gitignore`.

---

## 4. Consumer coverage

A vault reference only resolves if something evaluates it.

### direnv-exported environment (primary)
`direnv` runs `.envrc` and exports values into the real environment on `cd`. Any process launched from that shell — including `python-dotenv` / `dotenv` (npm) / `godotenv` apps — sees the values via the environment. This is the default; prefer it.

### Shell-sourced files
If the project genuinely `source`s a file, command substitution `$(pass show ...)` also runs at load time. `.envrc` via direnv is preferred over hand-sourcing.

### Consumers that do NOT inherit the shell environment
Docker containers, `launchd`/`systemd` services, and GUI/Spotlight launches do not see direnv's exports. Use the render-to-tempfile fallback in `pass-setup.md` (umask 077, `trap rm EXIT`, `--env-file`), run by the user. Do not commit a rendered env file; delete it immediately after launch.

---

## 5. Verification doctrine

A migration is not done until both conditions hold. Evidence, not assertion.

**Condition 1 — ggshield reports the finding cleared.**
```bash
ggshield secret scan path <file>
```
A clean run for the whole file is the evidence; a manual eyeball is not sufficient. If it came from a machine scan, also `ggshield machine scan <path> --rescan`.

**Condition 2 — the reference resolves to a non-empty value.** Confirm without echoing the value, in a shell WITHOUT `set -x` (xtrace prints expanded `KEY=<value>` to stderr):
```bash
direnv allow
[ -n "$KEY" ] && echo "resolved: non-empty" || echo "ERROR: empty"
```

### When verification fails
- ggshield still flags: plaintext not fully removed or a second occurrence exists (comments, disabled lines, alternate names). Re-list and repeat.
- Resolves empty: the `pass` entry path does not match the `.envrc` reference, the store is locked (`gpg-agent`), or `direnv allow` was not run. Re-check the path, unlock, re-allow.

---

## 6. Plaintext deletion and history hygiene

After ggshield confirms the working copy is clean:

### Remove the plaintext
Confirm the plaintext assignment is gone (deleted line, or whole `.env` removed in favor of `.envrc` + `.env.example`).

### Git history scrub
If the file is git-tracked, the value persists in history. If the repo was ever pushed or shared, this is a leak -> back to the leaked-first gate: rotate, do not just scrub. For local-only repos (never pushed/shared), a scrub is sufficient — the user runs it, never the agent automatically:
```bash
git filter-repo --path <relative/path/to/file> --invert-paths   # preferred; do NOT use git filter-branch
```
History rewrites are destructive (rewrite SHAs, break clones, require force-push). The agent authors the command, explains the impact, and waits for explicit confirmation. Add the file to `.gitignore` afterward.

### Shell history & editor leftovers
- If the value was ever typed as a command argument, it may be in `~/.zsh_history` / `~/.bash_history` — flag it; the user edits/removes the entry and reloads the shell.
- Editor leftovers: vim `.env.swp`/`.env~`, emacs `#.env#`. Flag them; `rm` as needed; add `*.swp`, `*~` to `.gitignore`.

The agent identifies these and names the files; it does not edit history or shell-history files automatically.

---

## 7. Future work — not in this version

Multiline / structured secrets (private keys, service-account JSON, TLS certs) are deferred. The known path is `pass insert -m` for storage and a render-to-tempfile pattern (umask 077, `trap rm EXIT`, pipe to the consuming tool) for runtime — but it is not built or evaluated here. When one appears, say it is out of scope and stop; do not split a blob across single-line entries or improvise.
