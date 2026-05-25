# Incident lifecycle, ignore taxonomy, and resolution semantics

This file is the conceptual map for the `triage-incidents` skill. Read it before constructing any write call so you pick the right transition and the right reason.

## Lifecycle states

A GitGuardian secret incident moves between four user-driven states. The state field is `status` on the incident object.

| State | What it means | How it got here |
|---|---|---|
| `TRIGGERED` | Open and unassigned. Default state for any new detection. | Detector found a match. |
| `ASSIGNED` | Open, owned by a specific workspace member. | `PATCH .../assign` from `TRIGGERED` or after `reopen`. |
| `RESOLVED` | Closed; the underlying secret was rotated or otherwise neutralized. | `PATCH .../resolve` from `TRIGGERED` or `ASSIGNED`. |
| `IGNORED` | Closed; the detection was intentionally dismissed for a stated reason. | `PATCH .../ignore` from `TRIGGERED` or `ASSIGNED`. |

> `assign` does not have its own state name in the API — assignment is a property of an open incident. Some payloads collapse `ASSIGNED` into "open with assignee_id" rather than a distinct status value. Treat `RESOLVED` and `IGNORED` as the only true closed states.

## Allowed transitions

```
                    +-----------+
                    | TRIGGERED |
                    +-----+-----+
                  assign /     \ ignore | resolve
                        v       v
                +----------+   +-----------------+
                | ASSIGNED |   | IGNORED         |
                +-----+----+   | or RESOLVED     |
        unassign /    \        +--------+--------+
                v     v ignore          |
        TRIGGERED    | resolve          | reopen
                     v                  v
              IGNORED or RESOLVED   TRIGGERED
                     |              (or ASSIGNED if the member is still set)
                     +--- reopen ---+
```

What this means in practice:

- You can `assign`/`unassign` only while the incident is open (TRIGGERED or already ASSIGNED).
- You can `ignore` or `resolve` from any open state.
- You can `reopen` only from a closed state (RESOLVED or IGNORED). Reopening sends the incident back to open; if it had an assignee, the assignee is typically preserved.
- You cannot directly transition between IGNORED and RESOLVED — you must `reopen`, then close again with the correct action.

## Ignore reasons — taxonomy

The `PATCH .../ignore` endpoint requires an `ignore_reason` enum. Picking the wrong reason distorts dashboards and skews compliance reporting; the skill is opinionated about how to choose.

| Reason | Use when | Do NOT use when |
|---|---|---|
| `test_credential` | The secret is a known fixture used only in tests, examples, or fixtures with no production access. Example: a fake AWS key like `AKIAIOSFODNN7EXAMPLE`, a test-only Stripe token in `tests/fixtures/`. | The credential might also be reachable in any non-test path. If unsure whether it's test-only, do not pick this. |
| `false_positive` | The detector matched non-secret content — a string that looks like a token but isn't. Example: a UUID in a comment, a base64-encoded image, a placeholder string. | The credential is real but you wish it wasn't. Use `low_risk` instead. |
| `low_risk` | The match is a real credential, but its blast radius is low — expired, throwaway, scoped to an internal-only service, already rotated, etc. Always add a note explaining the reasoning. | The secret is production-grade and active. That is a `resolve`-after-rotation case, not `low_risk`. |

If the user's context doesn't make the right reason obvious, ask before calling `ignore`. The wrong reason is harder to fix than waiting one round-trip to get it right.

## Resolution semantics

`PATCH .../resolve` accepts at minimum `secret_revoked` (boolean) and on workspaces with the relevant flag also accepts `secret_non_sensitive` (boolean). The body controls how the closure is counted in metrics:

- `secret_revoked: true` — the underlying secret has been rotated, deleted, or otherwise disabled. **Required** for any incident where the credential was real. The skill should never set this without explicit user confirmation that revocation actually happened — claiming revocation that didn't occur is the most common quiet failure mode.
- `secret_non_sensitive: true` — the credential exists but doesn't grant access to anything that matters (e.g., a token to a sandbox API with no real data). Mutually exclusive with `secret_revoked` in practice; pick one.

If neither applies — the credential is real, active, and sensitive, but you don't want it open right now — that's a deferral, and the right action is `ignore` with `low_risk` plus a note, not `resolve`.

## Multi-incident loop pattern

There is no bulk-PATCH endpoint. To act on many incidents at once, the agent must:

1. **List** candidates with the most specific filter possible (`detector_group_name`, `status`, `from_date`, `source_id`, `assignee_email`).
2. **Show the user the list** — incident IDs, brief description, current state — and the action that will be applied (`ignore` with reason `X`, or `resolve` with `secret_revoked: Y`).
3. **Get explicit confirmation.** Phrase as "About to <action> N incidents. Proceed?" — wait for an explicit yes.
4. **Loop one-by-one.** For each incident, issue the PATCH, capture the HTTP status, continue on success, stop and report on failure. Do not retry silently.
5. **Summarize.** Report `success_count`, `failure_count`, and the list of failed IDs with their error codes.

This is the only safe pattern for multi-incident operations from the agent. Do not parallelize without the user's explicit OK — concurrent PATCHes against the same workspace can hit rate limits and produce partial failures that are hard to reason about.

## Error codes the agent should expect

| Status | Meaning | Recovery |
|---|---|---|
| 200 / 204 | Success. 204 on actions that don't return a body. | Continue. |
| 401 | Token missing or invalid. | Re-check `GITGUARDIAN_API_KEY`; mint a fresh PAT. See `gitguardian-platform.md`. |
| 403 | Token lacks the required scope, or token is for the wrong workspace. | Confirm scopes (`incidents:write` for actions, `incidents:read` for list/get, `members:read` for assignment). |
| 404 | Incident ID not found. | Confirm the ID belongs to the workspace your token targets. |
| 409 | State conflict — e.g., trying to `resolve` an already-resolved incident, or `assign` to a closed incident. | Re-fetch the incident to see its current state; pick the right transition. |
| 422 | Validation error — bad `ignore_reason` value, malformed body. | Check the request body against `api-reference.md`. |
| 429 | Rate-limited. | Back off; do not auto-retry without a delay. Run `ggshield quota` to see remaining quota. |
