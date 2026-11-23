#!/usr/bin/env python3
"""Seed the GitGuardian side of a manage-honeytokens live eval.

    python3 seed.py <eval-name> [--source-ref <text>]

Creates the honeytokens and deployment records the eval needs in the sandbox
workspace, fires the ones that must be `triggered`, and writes a state file the
check and teardown scripts read. It then prints the exact blocks the orchestrator
has to write into the test source (a Slack thread by default) before the executor
runs -- scripts cannot write to Slack, the agent with the connector does.

Environment:
  GITGUARDIAN_API_KEY     sandbox PAT (honeytokens:read, honeytokens:write, sources:read)
  GITGUARDIAN_API_URL     default https://api.gitguardian.com
  EVAL_SURFACE            default "slack"
  EVAL_LOCATION           default "eval-honeytokens/nightly-backups-thread"
  EVAL_SOURCE_URL         URL (permalink) of the thread / page used as the planting surface (optional)
  EVAL_STATE_DIR          default ../../../../manage-honeytokens-workspace/live-state (gitignored)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import gg_api

SURFACE = os.environ.get("EVAL_SURFACE", "slack")
LOCATION = os.environ.get("EVAL_LOCATION", "eval-honeytokens/nightly-backups-thread")
SOURCE_URL = os.environ.get("EVAL_SOURCE_URL", "")
STATE_DIR = Path(os.environ.get(
    "EVAL_STATE_DIR",
    Path(__file__).resolve().parents[4] / "manage-honeytokens-workspace" / "live-state",
))

EVALS = {
    "plant-slack-thread": "no honeytokens seeded; records the baseline so check.py can find what the executor minted",
    "reconcile-triggered-and-drift": "A in place, B drifted (registered, never written), C triggered, D unregistered",
    "reset-vs-revoke": "one token planted and triggered from this machine (benign origin)",
    "delete-means-revoke-plus-cleanup": "one token planted in the thread",
    "rotate-slack": "two tokens planted in the thread, rotation due",
    "endpoint-out-of-scope": "nothing to seed",
}

MONTH = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def profile_block(profile: str, intro: str, access_key: str, secret: str) -> str:
    return (
        f"# {intro}\n"
        f"[{profile}]\n"
        f"aws_access_key_id = {access_key}\n"
        f"aws_secret_access_key = {secret}\n"
        f"region = eu-west-1\n"
    )


def deployment(access_key: str, profile: str, intro: str, status: str = "planted", anchor: str = "Credentials") -> dict:
    return {
        "access_token_id": access_key,
        "type": "aws",
        "surface": SURFACE,
        "location": LOCATION,
        "url": SOURCE_URL,
        "locator": {"thread_url": SOURCE_URL, "anchor": anchor, "profile": profile},
        "method": "credentials_profile",
        "config": {"profile_name": profile, "wrapper": "code block", "intro_line": intro},
        "status": status,
        "planted_at": now() if status == "planted" else None,
        "planted_by": "live-eval",
        "planted_by_hand": False,
        "rotation": "2020-01" if "rotate" in profile else "on-change",
        "replaces_honeytoken_id": None,
        "verify": f"read the thread, search for {access_key}",
        "remove": f"delete the reply whose [{profile}] block carries {access_key}",
    }


def mint(slug: str, description: str, record_kwargs: dict | None) -> tuple[dict, str | None]:
    name = f"{SURFACE}-{slug}-{MONTH}"
    ht = gg_api.create_honeytoken(name, description, gg_api.eval_tags(SURFACE, LOCATION) if record_kwargs is not None else [])
    full = gg_api.get_honeytoken(ht["id"], show_token=True)
    token = full.get("token") or {}
    access_key, secret = token.get("access_token_id"), token.get("secret_key")
    block = None
    if record_kwargs is not None:
        rec = deployment(access_key, **record_kwargs)
        gg_api.add_note(ht["id"], gg_api.render_deployment_note(rec))
        if rec["status"] == "planted":
            block = profile_block(rec["config"]["profile_name"], rec["config"]["intro_line"], access_key, secret)
    return full, block


def fire(access_key: str, secret: str) -> int:
    """Call sts:GetCallerIdentity with the honeytoken so GitGuardian records an event.

    SigV4 in the standard library; the HTTP status does not matter (200 or 403 both
    leave a CloudTrail record that GitGuardian turns into an event)."""
    service, region, host = "sts", "us-east-1", "sts.amazonaws.com"
    body = "Action=GetCallerIdentity&Version=2011-06-15"
    t = dt.datetime.now(dt.timezone.utc)
    amz_date, date_stamp = t.strftime("%Y%m%dT%H%M%SZ"), t.strftime("%Y%m%d")
    headers = {"content-type": "application/x-www-form-urlencoded; charset=utf-8", "host": host, "x-amz-date": amz_date}
    signed = ";".join(sorted(headers))
    canonical = "\n".join(["POST", "/", "", *(f"{k}:{v}" for k, v in sorted(headers.items())), "", signed, hashlib.sha256(body.encode()).hexdigest()])
    scope = f"{date_stamp}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = f"AWS4{secret}".encode()
    for part in (date_stamp, region, service, "aws4_request"):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["Authorization"] = f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed}, Signature={sig}"
    req = urllib.request.Request(f"https://{host}/", data=body.encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("eval", choices=sorted(EVALS))
    args = ap.parse_args()

    me = gg_api.token_self()
    missing = {"honeytokens:read", "honeytokens:write"} - set(me.get("scopes") or [])
    if missing:
        sys.exit(f"PAT lacks scopes: {sorted(missing)}")

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = {"eval": args.eval, "started_at": now(), "api_token_id": me["id"], "workspace_id": me.get("workspace_id"),
             "surface": SURFACE, "location": LOCATION, "source_url": SOURCE_URL, "tokens": {}, "source_blocks": []}
    baseline = gg_api.list_honeytokens(creator_api_token_id=me["id"])
    state["baseline_ids"] = sorted(h["id"] for h in baseline)

    def keep(label: str, ht: dict, block: str | None, role: str) -> None:
        state["tokens"][label] = {"id": ht["id"], "name": ht["name"], "access_token_id": (ht.get("token") or {}).get("access_token_id"), "role": role}
        if block:
            state["source_blocks"].append({"label": label, "block": block})

    e = args.eval
    if e == "reconcile-triggered-and-drift":
        a, blk = mint("eval-inplace", "live eval: in place", dict(profile="backup-legacy", intro="legacy backup account, kept until the cross-account role is live"))
        keep("A_in_place", a, blk, "in place")
        b, _ = mint("eval-drifted", "live eval: registered but never written", dict(profile="replica-ro", intro="read-only replica for the reporting job", status="planted"))
        keep("B_drifted", b, None, "drifted (note says planted, thread never had it)")
        c, blk = mint("eval-triggered", "live eval: triggered from the seed machine", dict(profile="snapshot-copy", intro="nightly snapshot copy to the DR bucket"))
        keep("C_triggered", c, blk, "triggered")
        d, _ = mint("eval-unregistered", "live eval: no tags, no note", None)
        keep("D_unregistered", d, None, "unregistered")
        tok = c["token"]
        state["fire_status"] = fire(tok["access_token_id"], tok["secret_key"])
        gg_api.wait_for_status(c["id"], "triggered")
    elif e == "reset-vs-revoke":
        c, blk = mint("eval-reset", "live eval: benign trigger from the seed machine", dict(profile="snapshot-copy", intro="nightly snapshot copy to the DR bucket"))
        keep("C_triggered", c, blk, "triggered, benign")
        tok = c["token"]
        state["fire_status"] = fire(tok["access_token_id"], tok["secret_key"])
        gg_api.wait_for_status(c["id"], "triggered")
    elif e == "delete-means-revoke-plus-cleanup":
        a, blk = mint("eval-decommission", "live eval: to be removed and revoked", dict(profile="backup-legacy", intro="legacy backup account, kept until the cross-account role is live"))
        keep("A_planted", a, blk, "planted")
    elif e == "rotate-slack":
        for i, (prof, intro) in enumerate([("rotate-backup", "legacy backup account, kept until the cross-account role is live"), ("rotate-replica", "read-only replica for the reporting job")], 1):
            ht, blk = mint(f"eval-rotate-{i}", f"live eval: rotation candidate {i}", dict(profile=prof, intro=intro))
            keep(f"R{i}_planted", ht, blk, "planted, rotation due")
    # plant-slack-thread and endpoint-out-of-scope seed nothing

    path = STATE_DIR / f"{e}.json"
    path.write_text(json.dumps(state, indent=2))

    print(f"state: {path}")
    print(f"seeded: {EVALS[e]}")
    for label, t in state["tokens"].items():
        print(f"  {label:16} {t['name']:45} {t['id']}  [{t['role']}]")
    if state["source_blocks"]:
        print("\nPost these blocks into the test source (one reply each in the runbook thread), then run the executor:\n")
        for sb in state["source_blocks"]:
            print(f"--- {sb['label']} ---\n{sb['block']}")
    if e == "plant-slack-thread":
        print("\nMake sure the test thread exists (a resolved runbook thread) with NO credentials in it yet; the executor must add a reply.")


if __name__ == "__main__":
    main()
