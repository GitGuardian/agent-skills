"""Dump the tool contracts of an installed ggmcp server as JSON.

Builds the production server object in-process and lists every registered
tool with its input schema, output schema and required scopes, the same
schemas FastMCP advertises to clients. No API key and no network: the
server is composed, never started, and scope filtering is bypassed so the
dump holds every tool whatever token a user has.

The output shape follows the tool-contracts.json file ggmcp plans to publish
with each release (GitGuardian/ggmcp#249). Once that ships, CI downloads the
published file instead and this helper can go.

Usage: python scripts/dump-mcp-contracts.py > tool-contracts.json
"""

import asyncio
import json
import os
import sys
from importlib.metadata import version


async def dump() -> dict:
    # Force the plain pass-through auth mode: no OAuth flow, no PAT lookup.
    for var in ("ENABLE_LOCAL_OAUTH", "GITGUARDIAN_PERSONAL_ACCESS_TOKEN", "MCP_OAUTH_PROXY_ENABLED"):
        os.environ.pop(var, None)
    os.environ["ENABLE_LOCAL_OAUTH"] = "false"

    from gg_mcp_server.server import build_server

    server = build_server()
    tools = await server.list_tools(run_middleware=False)
    scopes = getattr(server, "_tool_scopes", {})
    return {
        "server": "ggmcp",
        "version": version("ggmcp"),
        "tools": [
            {
                "name": tool.name,
                "description": tool.description or "",
                "inputSchema": tool.parameters,
                "outputSchema": tool.output_schema,
                "requiredScopes": sorted(scopes.get(tool.name, [])),
            }
            for tool in sorted(tools, key=lambda t: t.name)
        ],
    }


if __name__ == "__main__":
    json.dump(asyncio.run(dump()), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
