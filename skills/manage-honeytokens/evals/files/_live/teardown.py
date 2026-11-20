#!/usr/bin/env python3
"""Revoke every honeytoken the eval PAT created, so a run never leaves live decoys behind.

    python3 teardown.py [--eval <name>] [--dry-run]

Scope is `creator_api_token_id == this PAT`, which is why the sandbox PAT must be
dedicated to the evals. With --eval, only tokens from that eval's state file plus any
created after its `started_at` are revoked; without it, everything active or triggered
that this PAT ever created.

Revocation is terminal and does not count against quota afterwards. The source side
(the Slack thread or page) is not touched here: the orchestrator removes the blocks
with the connector, or leaves them -- a revoked key in a test thread is harmless.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import gg_api


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    me = gg_api.token_self()
    mine = [h for h in gg_api.list_honeytokens(creator_api_token_id=me["id"]) if h["status"] in ("active", "triggered")]

    if args.eval:
        state_dir = Path(os.environ.get("EVAL_STATE_DIR", Path(__file__).resolve().parents[4] / "manage-honeytokens-workspace" / "live-state"))
        state = json.loads((state_dir / f"{args.eval}.json").read_text())
        seeded = {t["id"] for t in state["tokens"].values()}
        mine = [h for h in mine if h["id"] in seeded or h.get("created_at", "") >= state["started_at"]]

    if not mine:
        print("nothing to revoke")
        return
    for h in mine:
        print(f"{'would revoke' if args.dry_run else 'revoking'} {h['name']} ({h['id']}, {h['status']})")
        if not args.dry_run:
            gg_api.add_note(h["id"], f"REVOKED live-eval teardown{(' ' + args.eval) if args.eval else ''}")
            gg_api.revoke_honeytoken(h["id"])
    print(f"{len(mine)} token(s) {'listed' if args.dry_run else 'revoked'}; remember to clean the test source with the connector")


if __name__ == "__main__":
    main()
