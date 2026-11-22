// Tests for scripts/check-mcp-contracts.mjs, the CI check that every ggmcp
// tool, argument, enum value and output field a skill names exists in the
// pinned server's tool contracts. The fixture is a trimmed copy of real
// ggmcp 0.8.0 contracts (list_honeytokens, get_remediation_workflow,
// list_internal_incidents) plus one synthetic tool with an enum behind a
// $ref.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkMentions,
  extractMentions,
  loadContracts,
  nearest,
  scanTree,
} from "../scripts/check-mcp-contracts.mjs";

const index = loadContracts(
  JSON.parse(
    readFileSync(join(__dirname, "fixtures/mcp-contracts/tool-contracts.json"), "utf8"),
  ),
);

type Finding = { line: number; message: { code: string; name: string; text: string } };

const check = (text: string, opts = {}): Finding[] =>
  checkMentions(extractMentions(text, index, opts), index);
const summary = (findings: Finding[]) =>
  findings.map((f) => `${f.line} ${f.message.code} ${f.message.name}`);

describe("contracts index", () => {
  it("resolves enum values behind a $ref", () => {
    const arg = index.tools.get("set_internal_incident_severity").args.get("severity");
    expect(arg.enum).toContain("critical");
  });

  it("collects enums nested in anyOf", () => {
    const arg = index.tools.get("list_honeytokens").args.get("status");
    expect(arg.enum).toEqual(["active", "triggered", "revoked"]);
  });
});

describe("drift shaped like PR #156 (list_honeytokens with REST-only names)", () => {
  // The row a review of #156 found: REST parameters documented as MCP
  // arguments, and a REST pagination field documented as MCP output.
  const doc = [
    "## ggmcp tools",
    "",
    "| Tool | Scope | Parameters | Notes |",
    "|---|---|---|---|",
    "| `list_honeytokens` | `honeytokens:read` | `mine`, `status` (`active` / `triggered` / `revoked`), `search`, `ordering` (`created_at`, `-created_at`, `name`), `show_token`, `creator_id`, `creator_api_token_id`, `per_page` (max 100), `cursor`, `get_all` | Returns `honeytokens[]`, `next_cursor`, `has_more`. |",
    "",
    "1. Cheap read: `list_honeytokens` with `per_page: 1`.",
    "",
  ].join("\n");

  it("reports every REST-only argument and the missing output field", () => {
    expect(summary(check(doc))).toEqual([
      "5 unknown-argument show_token",
      "5 unknown-argument creator_id",
      "5 unknown-argument creator_api_token_id",
      "5 unknown-argument per_page",
      "5 unknown-output-field next_cursor",
      "7 unknown-argument per_page",
    ]);
  });

  it("names the nearest valid name", () => {
    const texts = check(doc).map((f) => f.message.text);
    expect(texts).toContain("`list_honeytokens` takes no argument `per_page`; nearest: `page_size`");
    expect(texts).toContain("`list_honeytokens` returns no field `next_cursor`; nearest: `next_arguments`");
  });

  it("lists the valid arguments when nothing is close", () => {
    const text = check(doc).find((f) => f.message.name === "show_token")!.message.text;
    expect(text).toMatch(/valid: .*`page_size`/);
  });

  it("passes the corrected row", () => {
    const fixed = doc
      .replace(", `show_token`, `creator_id`, `creator_api_token_id`, `per_page` (max 100)", ", `page_size` (max 100)")
      .replace("`next_cursor`", "`next_arguments`")
      .replace("`per_page: 1`", "`page_size: 1`");
    expect(check(fixed)).toEqual([]);
  });

  it("reports an argument in a wrapped sentence that names two tools", () => {
    const text = "Do not mint with `generate_honeytoken` and do not call `list_honeytokens` with\n   `show_token: true` here.\n";
    expect(summary(check(text))).toEqual(["2 unknown-argument show_token"]);
  });

  it("reports the bare form in evals JSON", () => {
    const evals = '{"text": "list_honeytokens is never called with show_token true"}\n';
    expect(summary(check(evals, { bare: true }))).toEqual(["1 unknown-argument show_token"]);
  });
});

describe("tool names", () => {
  it("reports a renamed tool with its nearest replacement", () => {
    const findings = check("Pull incidents with `list_incidents` first.\n");
    expect(summary(findings)).toEqual(["1 unknown-tool list_incidents"]);
    expect(findings[0].message.text).toContain("nearest: `list_internal_incidents`");
  });

  it("accepts a server-prefixed tool name", () => {
    expect(check("Do not use `GitGuardian:list_honeytokens` here.\n")).toEqual([]);
  });

  it("ignores identifiers that are not tool-shaped", () => {
    expect(check("Run `ggshield secret scan` and read `get_all` or `list_of_things`.\n")).toEqual([]);
  });

  it("skips fenced code", () => {
    expect(check("```\n`list_incidents`\n```\n")).toEqual([]);
  });
});

describe("enum values", () => {
  it("reports a value the argument rejects", () => {
    const findings = check("Call `list_honeytokens` with `status: expired`.\n");
    expect(summary(findings)).toEqual(["1 unknown-enum-value expired"]);
    expect(findings[0].message.text).toMatch(/`status` rejects `expired`/);
  });

  it("accepts valid values, prefixed orderings included", () => {
    expect(check("Call `list_honeytokens` with `status: active` and `ordering=-created_at`.\n")).toEqual([]);
  });

  it("checks values in a parameter table bound by the paragraph above it", () => {
    const doc = [
      "Severity maps onto `set_internal_incident_severity`:",
      "",
      "| Level | Parameter |",
      "|---|---|",
      "| top | `severity`: `critical`, `urgent` |",
    ].join("\n");
    expect(summary(check(doc))).toEqual(["5 unknown-enum-value urgent"]);
  });
});

describe("output fields stay conservative", () => {
  it("accepts a name that may live inside an open object", () => {
    // get_remediation_workflow returns {workflow: {...open...}}; `id` is
    // documented as workflow.id and must not be reported.
    expect(check("`get_remediation_workflow` returned `id: <n>`, so it is custom.\n")).toEqual([]);
  });

  it("reports a name listed beside a real top-level field", () => {
    expect(summary(check("`get_remediation_workflow` returns `workflow` and `steps_count`.\n"))).toEqual([
      "1 unknown-output-field steps_count",
    ]);
  });

  it("reports a name absent from a closed schema", () => {
    expect(summary(check("`set_internal_incident_severity` returns `status`.\n"))).toEqual([
      "1 unknown-output-field status",
    ]);
  });
});

describe("binding stays conservative", () => {
  it("does not bind arguments in a sentence naming two tools", () => {
    expect(check("Use `list_honeytokens` or `list_internal_incidents`; pass `bogus_flag`.\n")).toEqual([]);
  });

  it("does not treat scopes as arguments", () => {
    expect(check("`list_honeytokens` (`honeytokens:read`) proves read access.\n")).toEqual([]);
  });

  it("does not check REST parameters outside a tool context", () => {
    expect(check("Call `GET /v1/honeytokens` with `show_token=true` from a shell.\n")).toEqual([]);
  });
});

describe("nearest", () => {
  it("prefers shared words over raw edit distance", () => {
    expect(nearest("count_incidents", ["count_internal_incidents", "list_sources"])).toBe("count_internal_incidents");
  });

  it("returns null when nothing is plausible", () => {
    expect(nearest("show_token", ["cursor", "mine"])).toBeNull();
  });
});

describe("scanTree", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };

  it("checks SKILL.md, references and evals, skips kiro/ and code fixtures", () => {
    root = mkdtempSync(join(tmpdir(), "mcp-contracts-"));
    write("skills/demo/SKILL.md", "Call `list_incidents`.\n");
    write("skills/demo/references/api.md", "Call `list_honeytokens` with `per_page: 5`.\n");
    write("skills/demo/evals/evals.json", '{"t": "calls list_honeytokens with show_token"}\n');
    write("skills/demo/evals/files/seed.py", "list_honeytokens(show_token=True)\n");
    write("kiro/skills/demo/SKILL.md", "Call `list_incidents`.\n");
    const findings = scanTree(root, index).map((f: Finding & { file: string }) => `${f.file}:${f.line} ${f.message.name}`);
    expect(findings).toEqual([
      "skills/demo/SKILL.md:1 list_incidents",
      "skills/demo/evals/evals.json:1 show_token",
      "skills/demo/references/api.md:1 per_page",
    ]);
  });

  it("honours the per-skill allow-list", () => {
    root = mkdtempSync(join(tmpdir(), "mcp-contracts-"));
    write("skills/demo/SKILL.md", "Call `list_incidents`.\nCall `list_honeytokens` with `per_page: 5`.\n");
    write(
      "skills/demo/evals/mcp-contracts-allow.json",
      JSON.stringify({ allow: [{ name: "list_incidents", reason: "historical name, quoted on purpose" }] }),
    );
    const findings = scanTree(root, index).map((f: Finding) => f.message.name);
    expect(findings).toEqual(["per_page"]);
  });

  it("rejects an allow-list entry without a reason", () => {
    root = mkdtempSync(join(tmpdir(), "mcp-contracts-"));
    write("skills/demo/SKILL.md", "x\n");
    write("skills/demo/evals/mcp-contracts-allow.json", JSON.stringify({ allow: [{ name: "x" }] }));
    expect(() => scanTree(root, index)).toThrow(/reason/);
  });
});
