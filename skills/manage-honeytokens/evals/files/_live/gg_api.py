"""Minimal GitGuardian Honeytoken API client for the manage-honeytokens live evals.

Standard library only. Reads GITGUARDIAN_API_KEY and GITGUARDIAN_API_URL from the
environment. Every helper returns parsed JSON; HTTP errors raise ApiError with the
response body so a failing fixture step says why.

The evals use a dedicated Personal Access Token for the sandbox workspace. Everything
the token creates is identifiable through `creator_api_token_id`, which is how
`teardown.py` finds what to revoke without touching anything else in the workspace.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_URL = os.environ.get("GITGUARDIAN_API_URL", "https://api.gitguardian.com").rstrip("/")
API_KEY = os.environ.get("GITGUARDIAN_API_KEY")

DEPLOYMENT_NOTE_PREFIX = "GG-DEPLOYMENT"


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"HTTP {status} on {url}: {body[:400]}")
        self.status = status
        self.body = body


def _require_key() -> None:
    if not API_KEY:
        sys.exit("GITGUARDIAN_API_KEY is not set (a sandbox-workspace PAT with honeytokens:read, honeytokens:write, sources:read)")


def request(method: str, path: str, body: dict | None = None, params: dict | None = None):
    _require_key()
    url = f"{API_URL}/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Token {API_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            link = resp.headers.get("Link", "")
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode(errors="replace"), url) from None
    payload = json.loads(raw) if raw else None
    return payload, link


def _next_cursor(link: str) -> str | None:
    for part in link.split(","):
        if 'rel="next"' in part:
            url = part[part.find("<") + 1 : part.find(">")]
            return urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("cursor", [None])[0]
    return None


def paginate(path: str, params: dict | None = None):
    params = dict(params or {})
    params.setdefault("per_page", 100)
    while True:
        page, link = request("GET", path, params=params)
        yield from page or []
        cursor = _next_cursor(link)
        if not cursor:
            return
        params["cursor"] = cursor


# --- token / workspace -------------------------------------------------------

def token_self() -> dict:
    payload, _ = request("GET", "/api_tokens/self")
    return payload


# --- honeytokens -------------------------------------------------------------

def list_honeytokens(**params) -> list[dict]:
    return list(paginate("/honeytokens", params))


def get_honeytoken(ht_id: str, show_token: bool = False) -> dict:
    payload, _ = request("GET", f"/honeytokens/{ht_id}", params={"show_token": str(show_token).lower()})
    return payload


def create_honeytoken(name: str, description: str, custom_tags: list[dict]) -> dict:
    payload, _ = request(
        "POST", "/honeytokens",
        body={"name": name, "type": "AWS", "description": description, "custom_tags": custom_tags},
    )
    return payload


def patch_honeytoken(ht_id: str, **fields) -> dict:
    payload, _ = request("PATCH", f"/honeytokens/{ht_id}", body=fields)
    return payload


def reset_honeytoken(ht_id: str) -> dict:
    payload, _ = request("POST", f"/honeytokens/{ht_id}/reset")
    return payload


def revoke_honeytoken(ht_id: str) -> dict:
    payload, _ = request("POST", f"/honeytokens/{ht_id}/revoke")
    return payload


def list_sources(ht_id: str) -> list[dict]:
    return list(paginate(f"/honeytokens/{ht_id}/sources"))


# --- notes -------------------------------------------------------------------

def list_notes(ht_id: str) -> list[dict]:
    return list(paginate(f"/honeytokens/{ht_id}/notes", {"ordering": "-created_at"}))


def add_note(ht_id: str, comment: str) -> dict:
    payload, _ = request("POST", f"/honeytokens/{ht_id}/notes", body={"comment": comment})
    return payload


def deployment_record(ht_id: str) -> dict | None:
    """Newest GG-DEPLOYMENT note, parsed. None if the token has no deployment record."""
    for note in list_notes(ht_id):  # already newest first
        comment = note.get("comment") or ""
        if comment.startswith(DEPLOYMENT_NOTE_PREFIX):
            start, end = comment.find("{"), comment.rfind("}")
            if start == -1 or end == -1:
                return {"_raw": comment, "_parse_error": "no JSON object found"}
            try:
                record = json.loads(comment[start : end + 1])
            except json.JSONDecodeError as e:
                return {"_raw": comment, "_parse_error": str(e)}
            record["_note_id"] = note.get("id")
            record["_api_token_id"] = note.get("api_token_id")
            return record
    return None


def render_deployment_note(record: dict) -> str:
    return f"{DEPLOYMENT_NOTE_PREFIX} v1\n```json\n{json.dumps(record, indent=2)}\n```"


# --- events ------------------------------------------------------------------

def list_events(ht_id: str, status: str = "open") -> list[dict]:
    return list(paginate("/honeytokens_events", {"honeytoken_id": ht_id, "status": status, "ordering": "-triggered_at"}))


def wait_for_status(ht_id: str, wanted: str, timeout_s: int = 240, every_s: int = 10) -> dict:
    deadline = time.time() + timeout_s
    while True:
        ht = get_honeytoken(ht_id)
        if ht.get("status") == wanted:
            return ht
        if time.time() > deadline:
            raise TimeoutError(f"honeytoken {ht_id} still {ht.get('status')!r} after {timeout_s}s, wanted {wanted!r}")
        time.sleep(every_s)


# --- tags helpers ------------------------------------------------------------

def tags_dict(ht: dict) -> dict:
    return {t.get("key"): t.get("value") for t in ht.get("custom_tags") or []}


def eval_tags(surface: str, location: str, planted_by: str = "live-eval", rotation: str = "on-change") -> list[dict]:
    return [
        {"key": "surface", "value": surface},
        {"key": "location", "value": location},
        {"key": "planted-by", "value": planted_by},
        {"key": "rotation", "value": rotation},
    ]
