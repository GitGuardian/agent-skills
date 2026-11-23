# Lifecycle Workflows

Loaded on demand from `SKILL.md`. Five runbooks: Plant, Reconcile, Reset, Revoke and clean up,
Rotate. Each names its reads, its confirmation-gated writes, and what to report. Tool and endpoint
details are in `honeytoken-api.md`; placement details per surface in `planting-playbook.md`; the
deployment record and the reconcile table in `deployment-registry.md`.

Vocabulary (shared with GitGuardian's endpoint protection): a **deployment** is one honeytoken in
one place; **plant** writes it there; **reconcile** compares server, registry and source and emits
`write` (should be present) or `delete` (revoked, remove the stale artifact); applying an action
ends with the deployment's `status` set to `planted`, `failed` or `removed`. `HT` is a honeytoken
id; "registry" means the four custom tags plus the newest `GG-DEPLOYMENT` note; "source
connector" means whichever MCP tool reaches the surface named in the registry. Every write to the
server or a source is preceded by showing the user exactly what will change and waiting for a yes.

## 1. Plant

Trigger: "plant / seed / deploy honeytokens in <surface>", or the proactive cases in `SKILL.md`.

**Fast path (default).** When the surface or location is named, collapse steps 1–5 into one
round-trip: infer the threat model from the ask, scout the top genuine location, fill every
default (name `<surface>-<slug>-<YYYY-MM>`, description "where / why / who / when", method from
the surrounding content, tags, `rotation: on-change`), and show a single plan table — `location
(link) | artifact | method | token name` plus the exact text — ending with one question: "go?".
No other question unless something is undecidable. The full dialogue below is for strategy
conversations ("how should we cover the OPS space") and multi-surface campaigns.

1. **Scope.** Ask the three planting questions (threat model, genuineness, blast pattern) unless
   the user already answered them. Propose the genuine option first.
2. **Capability check.** `list_honeytokens` (`per_page: 1`) proves read scope; `/v1/api_tokens/self`
   on the PAT proves write and gives the `workspace_id` to compare with `get_my_identity`;
   `list_sources` proves the target is monitored by that same workspace (SKILL.md rule 4). The
   write path for the surface decides the rest: a direct token the user holds (shell pipeline,
   pair never printed, edit and delete available), a connector (pair enters the conversation as a
   tool argument; say so), or neither (paste handoff from a file). Say which.
3. **Scout.** Through the source connector, find the genuine artifacts (the runbook, the thread,
   the resolved ticket, the project folder). Show two or three candidates per location with why
   each fits; let the user pick or accept the first.
4. **Plan table.** One row per deployment: `surface | location | artifact | method | token name |
   description`. Names follow `<surface>-<location-slug>-<YYYY-MM>`; check them against
   `list_honeytokens?search=` for collisions with active tokens.
5. **Draft content.** For each row, the exact text that will land in the source, rendered from
   the method's template with the two credential placeholders. Show it. Wait. The approval covers
   the filled text — only the placeholders change.
6. **Mint, one per deployment.** `POST /honeytokens` (or `/with-context`) with the four registry
   tags in the body, so the token is never active without its registry. Run it from the shell and
   keep the response in a shell variable or a temporary file, never in the conversation: only
   `id`, `gitguardian_url` and `token.access_token_id` are printed back (the key id is the
   registry's search needle; the secret never is). `generate_honeytoken` is not used: its
   response carries the pair. Recipes in `honeytoken-api.md` → *Mint-and-write pipelines*. If
   anything after this step fails, revoke the orphan in the same run.
7. **Register as `pending`.** `POST /honeytokens/HT/notes` with the `GG-DEPLOYMENT` note
   (`status: pending`, locator, method, config, verify, remove, planted_by). A token that exists
   on the server now has a deployment record even if the next step fails.
8. **Write to the source.** Fill the placeholders inside the same shell pipeline and post
   through the source API with the user's direct token (`chat.postMessage`, Confluence content
   API, Jira comment API, GitHub contents API), so the filled text exists only in the shell. With
   a connector only, the filled text is a tool argument and the pair enters the conversation:
   this was declared in the plan table and accepted at go. Read back and confirm the key id is
   present.
9. **Set the status.** `planted` with `planted_at` on success, `failed` with a one-line reason
   otherwise (reconcile will emit `write` again for it). Update the note in place when the key owns
   it, else append (newest wins).
10. **Report with links.** The table from `SKILL.md` → *Report format*: per deployment the
    honeytoken's `gitguardian_url`, the source URL as GitGuardian lists it (or "not scanned
    yet"), the exact permalink of the decoy (built with the surface's URL recipe), and the
    status. Then the scanner-visibility follow-up (after the source's next scan `/sources` must
    list it; `reconcile` checks), the alert route (Managers get email by default; Slack / Teams /
    ServiceNow / webhook in Settings → Integrations), and the one-line **Prove it** offer
    (section 6).

Handoff variant (no write path for the surface): steps 6, 7 and 9 run as normal; step 8 becomes
a file the pipeline writes on the user's machine (the filled artifact, `0600`) plus the exact
destination; the user opens the file and pastes. The pair still never enters the conversation.
The note records
`"planted_by_hand": true` plus the locator the user reports back; the status moves to `planted`
only when they confirm. Ask for the locator; "somewhere in Confluence" is not a locator.

## 2. Reconcile

Trigger: "list our honeytokens", "which rang / triggered", "are they still in place", or as the
first step of any other workflow. Read-only.

1. **Pull the inventory.** `list_honeytokens` with `get_all: true` (loop on `has_more`); default
   to all statuses, newest first. For "which triggered" filter `status: triggered` and order
   `-triggered_at`. Carry the system `tags` (`publicly_exposed`).
2. **Enrich.** For triggered tokens, `GET /honeytokens_events?honeytoken_id=HT&status=open`
   (count, first and last `triggered_at`, distinct `ip_address`, `action`, raw `tags`, `data`),
   then match each `ip_address` against `GET /v1/ips` on both instances: events from a
   GitGuardian egress CIDR with `GetCallerIdentity` and a `python-requests` user agent are the
   platform's own validity check and are counted apart as *self-trigger*, never as an intrusion.
   For every token, the registry and `/sources` (which sources and elements the scanner found
   the token in, on any surface).
3. **Read the source** when asked ("still in place?") or when the inventory is small (fewer than
   ~25 tokens; otherwise ask which surface to reconcile). Per token, call the source connector
   with the `locator` and search for the registry's `access_token_id` — no `show_token` needed.
4. **Derive actions** with the table in `deployment-registry.md`: `none` (in place), `write`
   (drifted, unfinished), `delete` (stale), `revoke` (orphaned), `ask` (unregistered), `review`
   (triggered). For VCS, add the host-API view (`vcs-playbook.md` verdict table): commit or
   branch or PR still reachable, squash-merge erased a `history` placement; compare `/sources`
   with the registry and flag duplication across
   repositories.
5. **Present** one table grouped by action: **Review** (triggered, with event summary and
   `publicly_exposed`), **write** (drifted / unfinished), **delete** (stale), **revoke**
   (orphaned), **ask** (unregistered), **rotation due** (per the `rotation` tag), then **in
   place**. Revoked-and-cleaned tokens are listed only if asked.
6. **Offer to apply**, per group, never as one bulk click: `review` → section 3 or 4; `write` →
   section 1 steps 8 and 9 with the existing token (no new mint); `delete` → section 4 step 2;
   `revoke` → section 4; `ask` → bootstrap the registry or revoke; rotation due → section 5.

Nothing in this workflow writes to the server or the sources; applying an action is the
confirmation-gated step that follows.

## 3. Reset (false alarm, re-arm)

Trigger: "reset this honeytoken", "that was one of us", or the user's decision after a triggered
review.

1. **Review the events first.** `GET /honeytokens_events?honeytoken_id=HT` (open ones, newest
   first). For each: `triggered_at`, `ip_address`, `action`, `tags` as returned, and the `data`
   object. Then the token's own `tags` and the registry: where this deployment lives and who can
   see it. Match every `ip_address` against GitGuardian's egress list (`GET /v1/ips`, both
   instances): a `GetCallerIdentity` from one of those CIDRs with a `python-requests` user agent
   is the internal-monitoring validity checker ringing the decoy it detected; say so and set those
   events aside before the question below.
2. **Decide with the user**, about the events that remain. Reset is right when the origin is benign and understood: a teammate
   tried the credential from the runbook, a CI job touched the file, an internal scanner. It is
   wrong when the origin is unknown, when the honeytoken carries the `publicly_exposed` tag (it
   was seen on public GitHub — the location leaked), when the IP is foreign to the organization,
   or when the `action` goes beyond `GetCallerIdentity` into enumeration (`ListBuckets`,
   `GetObject`, `DescribeInstances`). In those cases propose Revoke and clean up (section 4) and a
   secret hunt in the same location, routed to `triage-incidents`.
3. **Confirm, then** `POST /honeytokens/HT/reset`. Status returns to active, open events close,
   credentials are unchanged, so the deployment stays valid — no `write` action follows unless
   reconcile finds the artifact drifted.
4. **Prevent the repeat** when the benign origin is a stable internal IP: propose an IP rule /
   allowlist in the dashboard (events from allowlisted IPs become `allowed` and do not trigger).
   This is a dashboard setting; hand it over with the exact IP and reason.
5. **Note it.** `POST /honeytokens/HT/notes`: `RESET <date> by <who>: <origin> — <reason>;
   <allowlist proposed / not needed>`. When some events were self-triggers, name the egress IP in
   the note; expect them again on the next re-check until the checker excludes honeytokens.
6. **No PAT?** Offer the dashboard in the user's browser for the events read and the reset,
   proceed on their yes, and keep the read to the events table (`honeytoken-api.md`, *Tool
   selection order*).

## 4. Revoke and clean up

Trigger: "revoke / delete / remove / decommission this honeytoken", a confirmed compromise after
the triggered review, a `delete` action from reconcile (stale), or an orphaned deployment.

Order matters: **apply `delete` in the sources first, revoke last.** A revoked key left in a wiki
is a tell for attackers (it fails instantly) and noise for every scanner; a key revoked before
removal is one you can no longer prove was cleaned up by searching for it. (Endpoints do it the
other way round — server revokes, client deletes on the next reconcile — because that reconcile
runs within minutes; a Confluence page does not reconcile itself.)

1. **Read the registry** and `/sources`. List every place the token sits in — including VCS
   duplicates the server found that the registry does not know about.
2. **Apply `delete` at each location** through the connector, using the `remove` instructions in
   the `GG-DEPLOYMENT` note (delete the message, edit the page block out, delete the attachment,
   close the PR and delete the branch, delete the drive item). A `history`, `archived` or `tag`
   placement cannot be cleaned without a history rewrite: skip the removal, revoke, and say in the
   note that the pair remains in history. Confirm each removal before doing
   it, batch-confirm when the user says so. Read back to verify the key id is gone and set the
   deployment `status: removed`. Mention the places a copy can survive (Confluence page history,
   Slack exports, git history on a merged PR) and offer the purge where the surface allows one.
3. **Handle an active trigger.** If the token is triggered and the investigation is still open,
   stop: the armed token and its events are evidence. Revoke only when the user confirms the
   incident is remediated.
4. **Confirm, then** `POST /honeytokens/HT/revoke`. Terminal; the AWS key pair is deleted. There
   is no delete endpoint — the revoked token stays listed under `status=revoked` and no longer
   counts against quota.
5. **Note it.** `POST /honeytokens/HT/notes`: `REVOKED <date> by <who>: <reason>; removed from
   <locations>; <left in history: yes/no>`.
6. **Replace?** If the location still deserves a tripwire (the page exists, the channel is live),
   offer a fresh plant there (section 1) — a revoke without replacement leaves a hole in coverage.

## 5. Rotate (replace the decoy, keep coverage)

Trigger: "rotate the honeytokens in <surface>", a `rotation` tag that is due, a location changing
ownership or exposure (space opened to a vendor, repo archived, contractor offboarded), or a user
policy. Not a response to a trigger — that is section 3 or 4.

Rotation is reconcile with a planned replacement: for each selected deployment the actions are
`write(new)` and `delete(old)` at the same locator, applied in that order so coverage never drops
and attribution stays one-token-one-place, then the old honeytoken is revoked.

1. **Select.** From reconcile (section 2), the deployments to rotate: by surface, by location
   prefix, or all with `rotation <= this month`. Show the list with the current locator for each.
   Wait.
2. **Mint the replacements**, one per selected deployment, name with the new `YYYY-MM`,
   description copied and re-dated, the four tags carried over with `planted-by` = the rotating
   user and `rotation` advanced by the policy interval. Register each as `pending` with a
   `GG-DEPLOYMENT` note copied from the old one: same `locator`, `method`, `config`, plus
   `replaces_honeytoken_id` = the old id.
3. **Apply `write(new)`.** Through the write path (direct token first), edit the exact artifact
   from the locator, in one shell pipeline that fetches the new pair and submits the edit:
   replace the old `access_token_id` / `secret_key` pair with the new one, keep the surrounding
   context byte-for-byte (a rotation that rewrites the prose looks like a plant). Where the
   surface cannot edit in place (an attachment, an image layer, a pinned message by another
   author), plant the new artifact in the same spot and update the locator. Repositories: a fresh
   add+remove pair of commits for `history`, one replacing commit on the branch for `pr` /
   `branch`. Read back: new key id present → `status: planted`.
4. **Apply `delete(old)`.** Confirm the old key id is absent from the artifact (an in-place swap
   already did this; an add-beside needs the old artifact removed now). Read back → old
   deployment `status: removed`. For VCS, confirm `/sources` on the new token lists the repository
   (immediate for the open-PR pattern once the push lands).
5. **Revoke the old honeytoken** only after steps 3 and 4 succeed for that location: `POST
   /honeytokens/OLD/revoke`, then a note on the old token `ROTATED-TO <new id> <date> by <who>`
   and on the new one `ROTATED-FROM <old id>`. Copies that survive in history (page versions, git)
   now hold a revoked key: harmless, mention it.
6. **Report.** One line per deployment: `old name → new name — location — planted, old removed,
   old revoked`. Anything that failed stays with the old token active and the new one `failed`
   (or revoked if it was never written), listed under *not rotated* with the reason.

Why not reset instead of rotate? Reset keeps the credentials and only matters after a trigger.
Rotation changes the credentials; its value is that an attacker who copied the old decoy months
ago now holds a dead key and the live tripwire is the one in the current artifact — the same
reason real credentials are rotated.

## 6. Prove it (controlled trigger)

Trigger: "does it work?", "show me", "how do I know the alert fires", or offered at the end of
every plant. Nobody trusts a decoy they have never seen ring.

1. **Hand the user the test.** Print a command they run from their own laptop that reads the
   pair from the API with *their* PAT and runs the call without printing it (recipe in
   `honeytoken-api.md` → *Prove it without printing the pair*), or tell them to copy the pair
   from the artifact they can open via the third link. Never paste the pair into the chat. Say
   what will happen: the token turns `triggered`, Managers get the email, Slack / Teams / webhook
   fire if configured.
2. **Watch for the event.** Poll `GET /honeytokens/HT` every 15 s for up to 3 minutes until
   `status == triggered`, then `GET /honeytokens_events?honeytoken_id=HT` and show the event:
   time, their IP, `GetCallerIdentity`, and the event's `gitguardian_url`. If nothing arrives in
   3 minutes, check the token is still `active` and the credentials they used match the key id
   in the registry; a typo in the pair is the usual cause.
3. **Reset, with their say-so.** Ask "was that you?" once; on yes, `POST /reset` and a note
   `RESET <date> by <who>: controlled trigger test from <ip>`. Propose adding that IP to the
   dashboard allowlist if they will test again (events from it become `allowed`).
4. **Report** the same links table with status back to `planted`, plus the event link, so the
   user can forward one message that shows: here is the decoy, here is where it sits, here is
   GitGuardian seeing it, here is the alert.

Never run the trigger yourself from the agent's environment: the whole point is that the user
sees their own IP in the event.

## Confirmation gates, in one place

| Write | Gate |
|---|---|
| `POST /honeytokens*` (mint) | Plan table approved (one mint per approved row) |
| Any `write` or `delete` applied to a source | Exact content or exact removal shown and approved; batch approval allowed when the user asks for it |
| `PATCH` tags, `POST` / `PATCH` notes | Implicit with the plant / reconcile outcome / reset / revoke / rotate they belong to |
| `POST /reset` | Events reviewed and origin agreed benign |
| `POST /revoke` | `delete` applied (or user accepts leaving copies), incident closed if it was triggered |
| Dashboard handoffs (IP allowlist, deployment jobs, alerting) | Never executed by the agent; handed over with exact values |
