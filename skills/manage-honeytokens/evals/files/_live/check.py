#!/usr/bin/env python3
"""Programmatic post-conditions for a manage-honeytokens live eval (GitGuardian side).

    python3 check.py <eval-name> [--source-text <file>]

Reads the state file written by seed.py, queries the sandbox workspace, and prints a
grading.json-shaped list of expectations with `text`, `passed`, `evidence`. Pass
`--source-text` with a dump of the test source (the thread body the grader fetched
through the connector) to also check the source-side expectations; without it those
are reported as `passed: null` for the grader to settle by hand.

Exit code 0 when every checkable expectation passed, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import gg_api

AKIA = re.compile(r"AKIA[0-9A-Z]{16}")


def load_state(name: str) -> dict:
    state_dir = Path(os.environ.get(
        "EVAL_STATE_DIR",
        Path(__file__).resolve().parents[4] / "manage-honeytokens-workspace" / "live-state",
    ))
    path = state_dir / f"{name}.json"
    if not path.exists():
        sys.exit(f"no state for {name}: run seed.py first ({path})")
    return json.loads(path.read_text())


class Checks:
    def __init__(self):
        self.items: list[dict] = []

    def add(self, text: str, passed: bool | None, evidence: str) -> None:
        self.items.append({"text": text, "passed": passed, "evidence": evidence})

    def dump(self) -> int:
        checkable = [i for i in self.items if i["passed"] is not None]
        summary = {"passed": sum(1 for i in checkable if i["passed"]), "failed": sum(1 for i in checkable if not i["passed"]),
                   "unchecked": len(self.items) - len(checkable), "total": len(self.items)}
        print(json.dumps({"expectations": self.items, "summary": summary}, indent=2))
        return 0 if summary["failed"] == 0 else 1


def registry_ok(ht: dict, rec: dict | None, want_status: str | None = None) -> tuple[bool, str]:
    tags = gg_api.tags_dict(ht)
    missing = [k for k in ("surface", "location", "planted-by", "rotation") if k not in tags]
    if missing:
        return False, f"missing tags {missing}; have {tags}"
    if rec is None:
        return False, "no GG-DEPLOYMENT note"
    if "_parse_error" in rec:
        return False, f"GG-DEPLOYMENT note unparsable: {rec['_parse_error']}"
    needed = ["access_token_id", "surface", "location", "locator", "method", "status"]
    gaps = [k for k in needed if not rec.get(k)]
    if gaps:
        return False, f"note lacks {gaps}"
    if want_status and rec.get("status") != want_status:
        return False, f"note status {rec.get('status')!r}, wanted {want_status!r}"
    return True, f"tags {tags}; note status={rec.get('status')} method={rec.get('method')} locator keys={sorted(rec['locator'])}"


def new_tokens(state: dict) -> list[dict]:
    mine = gg_api.list_honeytokens(creator_api_token_id=state["api_token_id"])
    seeded = {t["id"] for t in state["tokens"].values()} | set(state.get("baseline_ids", []))
    return [h for h in mine if h["id"] not in seeded and h.get("created_at", "") >= state["started_at"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("eval")
    ap.add_argument("--source-text", help="file holding the current body of the test source")
    args = ap.parse_args()
    state = load_state(args.eval)
    source = Path(args.source_text).read_text() if args.source_text else None
    c = Checks()
    e = args.eval
    T = state["tokens"]

    def in_source(key: str) -> bool | None:
        return None if source is None else (key in source)

    if e in ("plant-slack-thread", "fast-path-prove-it"):
        created = new_tokens(state)
        c.add("Executor minted at least one new honeytoken", len(created) >= 1, f"{len(created)} new token(s): {[h['name'] for h in created]}")
        for h in created:
            full = gg_api.get_honeytoken(h["id"], show_token=True)
            rec = gg_api.deployment_record(h["id"])
            ok, ev = registry_ok(full, rec, want_status="planted")
            c.add(f"{h['name']}: four registry tags and a GG-DEPLOYMENT note with status planted", ok, ev)
            c.add(f"{h['name']}: name follows <surface>-<slug>-<YYYY-MM>", bool(re.match(r"^[a-z_]+-[a-z0-9-]+-\d{4}-\d{2}$", h["name"])), h["name"])
            c.add(f"{h['name']}: description is non-empty and under 250 chars", 0 < len(h.get("description") or "") <= 250, (h.get("description") or "")[:120])
            key = (full.get("token") or {}).get("access_token_id")
            c.add(f"{h['name']}: access key id present in the source", in_source(key or "\x00"), f"key {key}")
        if source is not None:
            keys = set(AKIA.findall(source))
            c.add("Every AKIA in the source belongs to a distinct new token (one token per deployment)",
                  len(keys) == len(created) and all(any((gg_api.get_honeytoken(h['id'], True).get('token') or {}).get('access_token_id') == k for h in created) for k in keys),
                  f"keys in source: {sorted(keys)}")
            c.add("No trap vocabulary in the source (honeytoken, canary, decoy, gitguardian)", not re.search(r"honeytoken|canary|decoy|gitguardian", source, re.I), "regex scan of the source body")

    elif e == "reconcile-triggered-and-drift":
        for label, t in T.items():
            ht = gg_api.get_honeytoken(t["id"])
            c.add(f"{label}: still {('triggered' if 'triggered' in label else 'active')} (reconcile is read-only)",
                  ht["status"] == ("triggered" if "triggered" in label else "active"), f"status={ht['status']}")
        notes_c = [n for n in gg_api.list_notes(T["C_triggered"]["id"]) if (n.get("comment") or "").startswith("RESET")]
        c.add("Triggered token was not reset during reconcile", not notes_c, f"RESET notes: {len(notes_c)}")
        c.add("Drifted token B was not re-minted (no new tokens created)", not new_tokens(state), f"new tokens: {[h['name'] for h in new_tokens(state)]}")
        if source is not None:
            c.add("Source untouched: A and C keys present, B key absent", in_source(T["A_in_place"]["access_token_id"]) and in_source(T["C_triggered"]["access_token_id"]) and not in_source(T["B_drifted"]["access_token_id"]), "source scan")

    elif e == "reset-vs-revoke":
        ht = gg_api.get_honeytoken(T["C_triggered"]["id"])
        notes = gg_api.list_notes(ht["id"])
        reset_notes = [n for n in notes if (n.get("comment") or "").startswith("RESET")]
        c.add("Token is active again (reset applied) or still triggered with a documented reason (reset declined)",
              ht["status"] in ("active", "triggered"), f"status={ht['status']}")
        c.add("Token was NOT revoked (benign origin)", ht["status"] != "revoked", f"status={ht['status']}")
        if ht["status"] == "active":
            c.add("A RESET note records origin and reason", bool(reset_notes) and len(reset_notes[0]["comment"]) > 20, (reset_notes[0]["comment"][:160] if reset_notes else "none"))
            c.add("Open events were closed by the reset", not gg_api.list_events(ht["id"], "open"), f"open events: {len(gg_api.list_events(ht['id'], 'open'))}")
        c.add("Deployment stays in the source (reset keeps credentials)", in_source(T["C_triggered"]["access_token_id"]), "source scan")

    elif e == "delete-means-revoke-plus-cleanup":
        ht = gg_api.get_honeytoken(T["A_planted"]["id"])
        rec = gg_api.deployment_record(ht["id"])
        notes = [n.get("comment") or "" for n in gg_api.list_notes(ht["id"])]
        c.add("Token is revoked", ht["status"] == "revoked", f"status={ht['status']}")
        c.add("Deployment record status is removed", bool(rec) and rec.get("status") == "removed", f"note status={rec.get('status') if rec else None}")
        c.add("A REVOKED note records reason and locations", any(n.startswith("REVOKED") for n in notes), f"notes: {[n[:40] for n in notes]}")
        c.add("Access key id removed from the source", (None if source is None else not in_source(T["A_planted"]["access_token_id"])), "source scan")

    elif e == "rotate-slack":
        created = new_tokens(state)
        c.add("Exactly one new token per rotated deployment", len(created) == len(T), f"{len(created)} new for {len(T)} old")
        for label, t in T.items():
            old = gg_api.get_honeytoken(t["id"])
            c.add(f"{label}: old token revoked", old["status"] == "revoked", f"status={old['status']}")
            c.add(f"{label}: old token has a ROTATED-TO note", any((n.get("comment") or "").startswith("ROTATED-TO") for n in gg_api.list_notes(t["id"])), "notes scan")
            c.add(f"{label}: old key absent from the source", (None if source is None else not in_source(t["access_token_id"])), "source scan")
        for h in created:
            full = gg_api.get_honeytoken(h["id"], show_token=True)
            rec = gg_api.deployment_record(h["id"])
            ok, ev = registry_ok(full, rec, want_status="planted")
            c.add(f"{h['name']}: registry complete, status planted", ok, ev)
            c.add(f"{h['name']}: replaces_honeytoken_id points at a seeded token", bool(rec) and rec.get("replaces_honeytoken_id") in {t['id'] for t in T.values()}, f"replaces={rec.get('replaces_honeytoken_id') if rec else None}")
            c.add(f"{h['name']}: ROTATED-FROM note present", any((n.get("comment") or "").startswith("ROTATED-FROM") for n in gg_api.list_notes(h["id"])), "notes scan")
            c.add(f"{h['name']}: new key present in the source", in_source((full.get("token") or {}).get("access_token_id") or "\x00"), "source scan")

        if e == "fast-path-prove-it":
            for h in created:
                notes=[n.get("comment") or "" for n in gg_api.list_notes(h["id"])]
                c.add(f"{h['name']}: back to active after the controlled test, with a RESET note", gg_api.get_honeytoken(h["id"])["status"]=="active" and any(n.startswith("RESET") for n in notes), f"status={gg_api.get_honeytoken(h['id'])['status']}, notes={[n[:30] for n in notes]}")
                c.add(f"{h['name']}: at least one event was recorded (any status)", bool(gg_api.list_events(h["id"], "open") or gg_api.list_events(h["id"], "archived")), "events scan")

    elif e == "endpoint-out-of-scope":
        c.add("No honeytoken was created", not new_tokens(state), f"new: {[h['name'] for h in new_tokens(state)]}")

    sys.exit(c.dump())


if __name__ == "__main__":
    main()
