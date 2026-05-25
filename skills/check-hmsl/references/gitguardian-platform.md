# GitGuardian Platform Reference

Shared, cross-skill reference for any skill in this repo that interacts with GitGuardian or `ggshield`. SKILL.md files point here so platform-level guidance (public docs URL pattern, auth/scope recovery, instance URLs, headless setup) lives in one place.

## Public Documentation

GitGuardian's public docs are at **https://docs.gitguardian.com**. The AI-agent content index is at **https://docs.gitguardian.com/llms.txt** — load it whenever you need a map of what's documented.

**Markdown shortcut for any doc page.** When the user shares an HTML docs URL (e.g. `https://docs.gitguardian.com/internal-repositories-monitoring/dashboard`), append `.md` to fetch the same content as Markdown:

```
https://docs.gitguardian.com/internal-repositories-monitoring/dashboard.md
```

Use this instead of `WebFetch` against the HTML page — it saves tokens, avoids HTML parsing, and returns the canonical content. Applies to every page on `docs.gitguardian.com`.

## Auth: Adding a missing scope (403 Forbidden / Insufficient permissions)

When any `ggshield` action fails with `403 Forbidden` or "Insufficient permissions", the current PAT is valid but is missing a scope this action requires (most commonly `honeytokens:write` for `ggshield honeytoken create`). The fix is a fresh OAuth login that requests the extra scope — **no manual PAT creation in the dashboard needed**:

```bash
ggshield auth logout
ggshield auth login --scopes <required-scope>      # e.g. honeytokens:write
```

`--scopes` extends the default `scan` scope during the OAuth flow. The browser opens; the user clicks "Authorize"; ggshield writes a fresh token with both `scan` and the additional scope.

**Run this on the user's behalf.** Both `ggshield auth logout` and `ggshield auth login --scopes <scope>` can be executed by the agent — the user only needs to approve in the browser tab that opens. This has been confirmed to work end-to-end; offer it before asking the user to create a PAT manually in the dashboard.

Verify with:

```bash
ggshield api-status
```

The `Token scopes:` line should now list the new scope alongside `scan`.

**If the OAuth login completes but the scope still doesn't appear in `api-status`** — the user's GitGuardian role lacks the privilege the scope confers. The token request completes with whatever scopes the workspace actually allows; missing privileges yield a token without the requested scope. Most commonly this is the **Manager** role requirement for `honeytokens:write`. Surface this to the user and ask them to have a workspace admin upgrade their seat (Settings → Members on the GitGuardian dashboard), or have a Manager-level teammate run the command instead.

## Headless environments (no browser)

When the OAuth flow can't open a browser (remote SSH, sandboxed dev container, devcontainer image), use `--method token`:

1. User creates a Personal Access Token at **https://dashboard.gitguardian.com/api/personal-access-tokens** (or the equivalent path on their instance) with the required scopes selected.
2. User runs `ggshield auth login --method token` and pastes the token at the prompt.
3. Verify with `ggshield api-status`.

`--method token` does not need a browser. It is the fallback when the OAuth flow can't run; the OAuth flow with `--scopes` is preferred when a browser is available because the agent can drive it end-to-end.

## GitGuardian Instances

By default `ggshield` targets **SaaS US**. To target a different instance, pass `--instance` on the *first* login (the choice persists in `ggshield`'s local config thereafter):

```bash
# SaaS US — default, no flag needed
ggshield auth login

# SaaS EU
ggshield auth login --instance https://dashboard.eu1.gitguardian.com

# Self-hosted GitGuardian
ggshield auth login --instance https://<their-instance-url>
```

The same `--instance` flag works on `auth login --method token`, `auth logout`, and any other auth-related subcommand.

## CI / non-interactive contexts

For stateless CI jobs without a persistent home directory, skip `ggshield auth login` entirely and set **`GITGUARDIAN_API_KEY`** as a pipeline secret. `ggshield` reads it directly — no on-disk config needed. This is the pattern documented for GitHub Actions, GitLab CI, CircleCI, and similar runners.

## Role and Permission Notes

`ggshield` actions and the GitGuardian roles / scopes they require:

| Action | Role required | PAT scope |
|---|---|---|
| `ggshield secret scan ...` | any role (incl. Free tier) | `scan` (default) |
| `ggshield honeytoken create` / `create-with-context` | **Manager** | `scan` + `honeytokens:write` |
| `ggshield api-status`, `ggshield quota` | any role | `scan` (default) |
| `ggshield install`, `ggshield auth`, `ggshield config` | n/a (local only) | n/a |

When in doubt about which scope a command needs, check the `Token scopes:` line of `ggshield api-status` against the command that just failed, and consult the [GitGuardian API scopes reference](https://docs.gitguardian.com/api-docs/authentication#scopes).
