# MCP-backed skills

For skills that drive the GitGuardian Developer MCP server (gg-mcp). The maintainer
version of these rules is the "MCP-backed skills" section of
`docs/maintainers/contributing.md`; it wins if they disagree.

## Where tool contracts come from

The only source for a tool's name, arguments, enum values and output fields is the input
and output schema that gg-mcp publishes for the version the skill declares in
`compatibility`. Do not read them from `api.gitguardian.com/docs`.

gg-mcp wraps the public API but does not mirror it. Known differences:

| REST API | gg-mcp |
|---|---|
| `creator_id`, `creator_api_token_id` | `mine` (boolean) |
| `per_page` | `page_size` |
| cursor read from a `next` link or a `next_cursor` field | `next_arguments` in the result |
| one endpoint for internal and public incidents | two tools, `*_internal_*` and `*_public_*` |
| caller-controlled flags such as `show_token` | fixed by the server, absent from the tool |

Example of the mistake, from a real pull request:

```text
Wrong (REST names on the MCP tool):
  list_honeytokens  show_token=false  creator_id=<id>  per_page=1
  next page: read next_cursor

Right (gg-mcp 0.8.0 schema):
  list_honeytokens  mine=true  page_size=1
  arguments: status, search, mine, ordering, page_size, cursor, get_all
  next page: call again with next_arguments as given
```

An agent that sends unknown arguments gets a rejected call, or, when the client drops
them, a result that silently differs from the one the skill expects.

## How to verify

1. Read the gg-mcp version pinned in `package.json` (`ggmcp` key) if it exists, or the
   version the skill declares.
2. Dump the contracts and run the check when `scripts/dump-mcp-contracts.py` and
   `scripts/check-mcp-contracts.mjs` exist in the repository:

   ```bash
   python3 -m venv /tmp/ggmcp
   /tmp/ggmcp/bin/pip install --index-url https://pypi.org/simple \
     "ggmcp @ git+https://github.com/GitGuardian/ggmcp.git@$(jq -r .ggmcp.commit package.json)"
   /tmp/ggmcp/bin/python -I scripts/dump-mcp-contracts.py > /tmp/tool-contracts.json
   npm run check:mcp-contracts -- /tmp/tool-contracts.json
   ```

   The dump needs no API key and makes no call to GitGuardian. Once the `mcp-contracts`
   check is in CI, it runs the same check on every pull request.
3. If the scripts do not exist yet, read each tool's input schema from a connected gg-mcp
   of the declared version, and compare every name the skill uses against it by hand.
4. Fix the skill, not the check. Use the allow-list the check documents only when the
   text is right as written (for example, it quotes an old name on purpose).
5. Write the version you checked in the pull request description.

Fenced code blocks are not read by the check. A REST call written in a fenced block is
not flagged as an MCP call, so keep REST examples in fenced blocks and say they are REST.

## Pagination

List tools return `has_more`, `stop_reason` and `next_arguments`. For the next page,
call the same tool with `next_arguments` exactly as given. Do not build a cursor.
`get_all` fetches several pages in one call up to a size or page limit; `stop_reason`
says which limit stopped it. A skill that reconciles, counts or audits must page until
`has_more` is false, or tell the user it stopped early.

## Scope hiding

gg-mcp hides the tools the token's scopes do not allow. A missing tool means a missing
scope. The skill must:

- list the scopes it needs in `compatibility` and in Prerequisites;
- tell the agent, in Troubleshooting, to call `get_my_identity` (it returns the token's
  scopes and the user's role) and to ask the user for a token with more scopes, instead
  of falling back to another path.

## Privacy mode

With privacy mode on, the GitGuardian API replaces sensitive values (credentials, IP
addresses, and similar) with `<GG>OBFUSCATED</GG>`. Privacy mode is on when the request
sends the `X-Privacy-Mode` header set to true, or when the workspace enforces it for the
caller's role; then the API ignores the header. See
https://docs.gitguardian.com/platform/security-data-privacy/privacy-mode.

gg-mcp sends the header on most calls and turns privacy mode off on honeytoken calls.
Workspace enforcement still applies, and a REST call with a personal access token gets the
same masked response. A skill that reads a credential or another sensitive value from
the API must:

- check the value for `<GG>OBFUSCATED</GG>` before it uses it;
- stop and tell the user that the workspace enforces privacy mode for their role, instead
  of writing, planting or comparing the marker as if it were the value.

## Live eval harnesses

Evals that need a sandbox workspace, a personal access token, a Slack channel or other
live resources keep only `evals/files/README.md` in this repository. The README
describes the procedure: what to seed, what to run, how to grade, how to tear down. The
runnable scripts live in the internal skill package, where the internal eval tooling and
CI run them. Do not commit seed, check or teardown scripts that need credentials.
