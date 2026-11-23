# Planting Playbook — Integrated Sources

Loaded on demand from `SKILL.md`. Where and how to plant a honeytoken in each source GitGuardian
can scan, so the decoy is found by the people you want to catch and never used by the people you
work with. Endpoints (developer machines) are deliberately absent — `ggshield honeytoken plant`
owns them and syncs with the server on its own. Local repository files are covered by
`create-honeytokens`; this playbook covers planting *through the source's own API or connector*.

## The planting conversation

Ask for the deployment strategy, but lead with a proposal. Three questions settle it:

1. **Threat model** — what would an attacker who got into this surface be doing? Scraping a wiki
   for credentials, reading a leaked Slack export, cloning every repository they can see, downloading
   shared drives, reading tickets after a helpdesk account takeover. The answer picks the surface
   and the spot inside it.
2. **Genuineness level** — default to the most genuine placement the surface allows: inside an
   existing artifact that already looks like it should hold credentials (a runbook's credentials
   block, a real deployment ticket's config attachment, a pinned "how to access staging" message).
   Fall back to a new artifact only when nothing suitable exists, and then make it look old and
   boring (a `legacy-*` page, a closed ticket from a past migration), never a page called
   "secrets".
3. **Blast pattern** — one token per location, so how many locations? One per space / channel /
   project is the usual answer; one per page or ticket when the goal is to attribute a leak to a
   document.

Then show the plan: a table of `surface | location | artifact | method | token name`, and the
exact content that will be written. Write only after approval. A plan with more than ten
deployments is batched; confirm the first batch, then proceed one deployment at a time, reporting
each.

## Realism rules (every surface)

- The credential pair must look like what the surface's real users would leave behind. Ops teams
  leave `[profile]` blocks and `AWS_ACCESS_KEY_ID=` lines; ticket attachments are `.env`,
  `config.yaml`, `terraform.tfvars`; wiki pages have a "Credentials" or "Access" heading.
- Give it a reason to exist that also tells a teammate not to use it: *legacy*, *to be removed
  after the migration*, *read-only replica*, *old backup bucket*, *deprecated — see vault*. A
  teammate reads "deprecated"; an attacker reads "AKIA".
- Never use the words honeytoken, canary, decoy, GitGuardian, or anything that reads as a trap, in
  or near the planted content. Surfaces with a hidden-metadata channel (page labels, ticket
  labels, Slack message metadata, SharePoint columns) may carry an internal marker such as a label
  `gg-ht` for defenders — scrapers copy content, not labels.
- Attach the honeytoken to something real: a bucket name that exists in your naming scheme, a
  region you actually use, a service name from the same page.
- Put the whole pair where one search finds it: `aws_access_key_id` and `aws_secret_access_key`
  within a few lines, not split across a page and an attachment.

## Placement methods and their templates

The `method` recorded in the `GG-DEPLOYMENT` note says how the credential pair is materialized;
`config` holds the parameters needed to reproduce the exact artifact. Pick the method that
matches the surrounding content. Replace `AKIA…` / `…` with the token.

**`credentials_profile`** — an AWS `[profile]` block (runbooks, tickets, chat snippets); the
source-side twin of the endpoint's `aws_config_profile` method. `config.profile_name`:

```ini
# legacy profile for the nightly RDS snapshot copy — remove after the eu-west-3 migration
[backup-legacy]
aws_access_key_id = AKIA…
aws_secret_access_key = …
region = eu-west-1
```

**`dotenv`** (attachments, "how to run locally" pages). `config.filename`:

```dotenv
# staging — read-only replica, do not use for prod
AWS_ACCESS_KEY_ID=AKIA…
AWS_SECRET_ACCESS_KEY=…
AWS_DEFAULT_REGION=eu-west-1
S3_BUCKET=acme-reports-staging
```

**`yaml`** (Helm values, CI variables pasted in a ticket). `config.filename`, `config.key_path`:

```yaml
backup:
  bucket: acme-db-backups-legacy
  accessKeyId: AKIA…
  secretAccessKey: …
  region: eu-west-1
```

**`tfvars`** (infra tickets, "migration notes" pages). `config.filename`:

```hcl
# old backup account, kept until the cross-account role is live
aws_access_key = "AKIA…"
aws_secret_key = "…"
```

**`code_context`** — a code-shaped file for a repository: `POST /v1/honeytokens/with-context`
(or `ggshield honeytoken create-with-context`) generates the whole file in the project's
language. `config.language`, `config.filename`.

**`attachment`** — any of the above dropped into the artifact as a whole file (ticket
attachment, drive item, channel file) rather than inline. `config.filename`, plus the inner
method in `config.inner_method`.

Whatever the method, `config.intro_line` records the one line of prose that gives the block its
reason to exist, so a re-plant or a swap reproduces the artifact byte-for-byte.

## URL recipes — the link users click

Every report needs the exact permalink of the decoy. Build it from the locator:

| Surface | Permalink |
|---|---|
| Slack message | `https://<workspace>.slack.com/archives/<channel_id>/p<message_ts without the dot>` (+ `?thread_ts=<thread_ts>&cid=<channel_id>` for a reply) — or `chat.getPermalink` |
| Slack file | the file's `permalink` from the upload response |
| Teams message | the `webUrl` returned by Graph for the message; Teams file: the drive item's `webUrl` |
| Jira comment | `https://<site>/browse/<ISSUE-KEY>?focusedCommentId=<comment_id>`; attachment: `https://<site>/secure/attachment/<id>/<filename>` |
| ServiceNow record | `https://<instance>.service-now.com/nav_to.do?uri=<table>.do?sys_id=<sys_id>`; attachment: `/sys_attachment.do?sys_id=<attachment_sys_id>` |
| Confluence page | the page `_links.webui` URL + `#<heading-anchor>`; attachment: `_links.download`; comment: page URL + `?focusedCommentId=<id>` |
| SharePoint / OneDrive | the drive item's `webUrl` (+ `?web=1`); a spreadsheet cell: `webUrl` + `#'Sheet1'!B7` |
| GitHub | `https://github.com/<o>/<r>/blob/<sha>/<path>` for a commit-pinned file, `.../commit/<sha>` for a history placement, `.../pull/<n>/files` for a PR |
| GitLab | `https://gitlab.com/<g>/<p>/-/blob/<sha>/<path>`, `/-/commit/<sha>`, `/-/merge_requests/<iid>/diffs` |
| Registry / S3 | the registry's tag page; the S3 console object URL (`https://s3.console.aws.amazon.com/s3/object/<bucket>?prefix=<key>`) |

Store it as `url` in the deployment record; the GitGuardian side of the pair is the honeytoken's
`gitguardian_url` and, once scanned, `/sources[].url`.

## Surface by surface

Each entry: where attackers look → genuine placement → connector calls → registry locator → how
to verify → how to remove. Connector tool names vary by MCP server; the calls are described by
intent, and the agent uses whichever tool it has for that intent. No connector means: draft the
content, hand the paste to the user, and still write the registry from what they report back.

### Code repositories (GitHub, GitLab, Bitbucket, Azure DevOps)

Repositories have their own playbook, [vcs-playbook.md](vcs-playbook.md), because they are the
surface where the three readers disagree most: attackers' tooling clones every ref and full history,
the organisation's own scanners do the same and may *verify* the key (and ring it), and
teammates only ever look at the default branch at HEAD. The placements there (`history`,
`pr`, `branch`, `archived`, `tag`) are chosen so the first two find the token and the third
never does, and deployments go through the host's API rather than a local clone. As on every
surface, `/sources` lists the repositories and files where the scanner saw the token, so
reconcile cross-checks the registry against it.

### Slack

Attackers get Slack through exported workspaces, compromised accounts, and over-scoped apps that
read channel history. They search `AKIA`, `aws_secret`, `password`.

- **Genuine placement:** a reply deep in a real, resolved "how do I access X" thread of an
  existing ops / infra / on-call channel, or a `.env` / config file shared as an attachment in
  such a thread. Both are elements the integration indexes; a canvas is not (today), so a decoy
  there never passes the scanner-visibility test. Old threads are read by nobody and cloned by
  everyone who exports the workspace. Avoid new channels; a channel named `#aws-creds` with one
  message is a tell.
- **Write path:** scout through the connector (search channels, read history) to find the
  thread. Post through the Slack API with a user token the user keeps in a file (`chat.postMessage`
  in a shell pipeline, see `honeytoken-api.md`): the reply appears as the user, carries no
  assistant footer, the pair never enters the conversation, and `chat.update` / `chat.delete` are
  available for rotation and removal. An assistant connector's `send_message` is the degraded
  path: the message text is a tool argument (the pair enters the conversation), the post may carry
  a "Sent using …" footer that marks it as agent-posted, and most connectors cannot edit or delete,
  so rotation and removal become handoffs. Declare all of that in the plan table before go.
- **Locator:** `team_id`, `channel_id`, `channel_name`, `message_ts` (+ `thread_ts`), or
  `file_id`.
- **Verify:** read the thread by `thread_ts` and search for `access_token_id`; `/sources` lists
  the workspace and the message once scanned; a workspace-wide search for the key id also
  catches copies into other channels.
- **Remove:** delete the message or the file. Deletion of another user's message needs admin;
  otherwise hand it over.
- **Note:** GitGuardian's Slack *alerting* integration is unrelated to planting; if the user wants
  trigger alerts in Slack, point them to Settings → Integrations (All-incidents team).

### Microsoft Teams

Same threat model as Slack, plus Teams files live in SharePoint behind the channel.

- **Genuine placement:** a reply at the bottom of an old, finished conversation about environment
  access, or a `.env` / `config.yaml` in the channel's Files tab under a folder that already holds
  setup docs nobody opens any more. Files are the better choice: they survive message retention,
  read as real artifacts, and are indexed as attachments. Nothing in a pinned or recent message
  that the channel's regulars will read this week.
- **Connector calls:** list teams and channels, read the conversation, post a reply, or upload the
  file to the channel's drive folder (Graph: the channel's `filesFolder`).
- **Locator:** `team_id`, `channel_id`, `message_id`, or `file_item_id` + `drive_id`.
- **Verify:** fetch the message / download the file and search for the key id.
- **Remove:** delete the message or the drive item.

### Jira (Cloud and Data Center)

Attackers who pivot through a helpdesk or developer account read tickets for credentials shared
"just this once". Search terms: `AKIA`, `credentials`, `access key`, attachments named `.env`.

- **Genuine placement:** a comment or a `.env` / `values.yaml` attachment on a **real, resolved**
  infrastructure or migration ticket from a past quarter ("attached the legacy backup account for
  the cut-over"). Resolved tickets are exactly what nobody re-opens and what every export, search
  index and scanner still covers; tickets, comments and attachments are all indexed elements.
  Second choice: the description of a closed ticket. Never an open ticket someone is working on.
  Avoid creating a fresh ticket unless the project genuinely has "access request" tickets, in which
  case create one in that template and resolve it.
- **Connector calls:** search issues (JQL by project, type, resolution, date), read the issue,
  add a comment or upload an attachment, transition if you created the ticket.
- **Locator:** `site`, `issue_key`, `where` (`description` / `comment:<id>` /
  `attachment:<id>:<filename>`).
- **Verify:** read the issue (fields, comments, attachments) and search for the key id; a JQL
  `text ~ "AKIA…"` also finds copies.
- **Remove:** delete the comment or attachment; edit the description. Deleting comments may need
  project admin.

### ServiceNow

Attackers with an ITSM foothold read knowledge articles and change records.

- **Genuine placement:** a work note or attachment on a **closed** change request
  (`change_request`) from a real migration, or a credentials block in a retired knowledge article
  (`kb_knowledge`) that is still indexed but no longer linked from the live runbooks. Closed and
  retired records are the ones real users never open and the integration still scans.
- **Connector calls:** query the table by `number` or keyword, read the record, update the field
  or add the attachment.
- **Locator:** `instance`, `table`, `sys_id`, `number`, `field` or `attachment_sys_id`.
- **Verify:** read the record by `sys_id` and search for the key id.
- **Remove:** edit the field or delete the attachment.
- **Note:** the ServiceNow *alerting* integration can open tickets on honeytoken triggers; it is
  separate from planting.

### Confluence (Cloud and Data Center)

The highest-signal non-code surface: wikis are where real credentials get written down, and they
leak through "anyone with the link", exported spaces, and compromised accounts.

- **Genuine placement:** an attachment (`backup.env`) or a footer comment on an old runbook that
  the team no longer reads but has not deleted, or a code block in a page of the space's
  "archived" / "legacy" tree. Pages, blog posts, comments and attachments are all indexed
  elements; the live runbook everyone opens on call is the one place not to use, because a
  teammate will tidy the block away or try it. Avoid a new page unless an old-looking page is
  unremarkable in that tree.
- **Connector calls:** search the space (CQL by title / label / text), fetch the page body (storage
  format), update the page with the inserted block, or upload an attachment. Add label `gg-ht`
  for defenders.
- **Locator:** `cloud_id` or `base_url`, `space_key`, `page_id`, `anchor` or `attachment_id`.
- **Verify:** fetch the page body by id and search for the key id; a CQL `text ~ "AKIA…"` finds
  copies into other pages.
- **Remove:** edit the page body to delete the block (a new version — the old version keeps the
  token in page history; mention this to the user and offer to purge history if the space allows).

### SharePoint Online and OneDrive

Attackers with a Microsoft 365 foothold sync whole libraries. They search document content.

- **Genuine placement:** a `.env`, `config.yaml` or `setup-notes.md` inside an existing but
  dormant project folder (a finished migration, an old vendor onboarding) that already holds
  setup documentation, or a credentials table at the end of an old "Environment access" Word
  document nobody has edited this year. Files and pages are indexed elements; a file the team
  opens weekly is not a candidate. Avoid a file named `passwords.xlsx` in the root.
- **Connector calls:** search the drive, download the file, edit and re-upload (or upload the new
  file), set a column `Internal-Marker = gg-ht` if the library has custom columns.
- **Locator:** `drive_id`, `item_id`, `path`, `web_url`, `inside`.
- **Verify:** download the item by id and search for the key id; a drive-wide content search also
  catches copies.
- **Remove:** edit the file to drop the block, or delete the item; empty the recycle bin if the
  user wants it gone for good.

### Container and package registries (Docker Hub, ECR, ACR, GAR, JFrog, Quay)

Attackers pull images and `docker history` / extract layers.

- **Genuine placement:** a config file baked into an image at build time (`/app/config/backup.env`)
  on an image tag that is published but not deployed (`:legacy`, an old minor). This is a build
  change: hand the Dockerfile diff and the `with-context` content to the user, or open the PR by
  connector as for repositories.
- **Locator:** `registry`, `image`, `tag`, `path_in_image`.
- **Verify:** pull the tag and grep the layer, or rely on the registry integration's own scan.
- **Remove:** delete the tag; rebuild without the file.

### Object storage (S3)

- **Genuine placement:** a `backup.env` or `terraform.tfvars` in an existing bucket prefix that
  holds deployment artifacts, with an old `LastModified` neighbor. Prefer buckets that are *not*
  public; a public bucket makes the token fire from scanners within hours and tells you nothing
  about your attackers.
- **Locator:** `bucket`, `key`, `version_id`.
- **Verify / remove:** `GetObject` / `DeleteObject` by key (and version).

## After the plant

For every deployment, in this order and without skipping: register it (tags + `GG-DEPLOYMENT`
note, `status: pending`), write, confirm by reading the source back, set `status: planted`, then
report one line per deployment: `token name — location — planted — gitguardian_url`. The
deployment is finished only when it passes the **scanner-visibility test**: after the source's
next scan, `/sources` lists it. Reconcile checks this; a deployment that stays unlisted is moved
to an indexed element, never left as is — a decoy the organisation's own scanner cannot see is
one an attacker's scanner may not see either. Suggest the alerting route if none
is configured (email to Managers is on by default; Slack / Teams / ServiceNow / webhooks are in
Settings → Integrations), because a honeytoken nobody is paged for is a log line, not a tripwire.
