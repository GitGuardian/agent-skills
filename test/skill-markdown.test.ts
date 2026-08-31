// Regression tests for the reviewer-invisible-character policy enforced by
// scripts/check-skill-markdown.mjs (see the validate workflow). The policy is
// security-sensitive: skill prose is instructions the agent follows, so any
// character a human reviewer cannot see is smuggling surface (OWASP Agentic
// Skills Top 10, AST04). Table-driven on purpose — every prohibited range is
// enumerated here so a regex regression shows up as a named test failure.
// All prohibited characters appear as \u escapes, never literally: this file
// must itself stay readable to reviewers.
import { describe, expect, it } from "vitest";
import {
  checkBytes,
  checkText,
  scanTree,
} from "../scripts/check-skill-markdown.mjs";

const labels = (findings: { label: string }[]) =>
  findings.map((f) => f.label);

describe("clean content", () => {
  it("accepts ordinary markdown, tabs included", () => {
    expect(checkText("# Title\n\nplain prose\twith a tab\n")).toEqual([]);
  });

  it("accepts accented and non-Latin text", () => {
    expect(checkText("café — сюрприз — 日本語\n")).toEqual([]);
  });
});

describe("control characters (category Cc)", () => {
  // Every C0 control except tab (0x09) and newline (0x0A) is prohibited.
  // U+000B, U+000C, and U+001C–U+001E are the regression the review caught:
  // Python's splitlines() treated them as line boundaries and dropped them
  // before the old regex ran.
  const prohibitedC0 = [...Array(0x20).keys()].filter(
    (c) => c !== 0x09 && c !== 0x0a,
  );
  it.each(prohibitedC0.map((c) => [c.toString(16).padStart(4, "0"), c]))(
    "rejects U+%s",
    (_hex, code) => {
      const findings = checkText(`before ${String.fromCharCode(code)} after\n`);
      expect(findings).toHaveLength(1);
      expect(findings[0].label).toMatch(/invisible or control character/);
    },
  );

  it("rejects U+007F DELETE", () => {
    expect(checkText("a\u007fb\n")).toHaveLength(1);
  });

  // C1 controls (0x80–0x9F) are also Cc; U+0085 NEL was another
  // splitlines() boundary in the old implementation.
  it.each([[0x80], [0x85], [0x9f]])("rejects C1 control %#x", (code) => {
    expect(checkText(`a${String.fromCharCode(code)}b\n`)).toHaveLength(1);
  });

  it("allows tab and newline", () => {
    expect(checkText("a\tb\nc\n")).toEqual([]);
  });
});

describe("invisible format characters (category Cf) and line/para separators", () => {
  const cases: [string, string][] = [
    ["U+00AD soft hyphen", "\u00ad"],
    ["U+061C arabic letter mark", "\u061c"], // missed by the old range table
    ["U+180E mongolian vowel separator", "\u180e"],
    ["U+200B zero width space", "\u200b"],
    ["U+200C zero width non-joiner", "\u200c"],
    ["U+200D zero width joiner", "\u200d"],
    ["U+200E left-to-right mark", "\u200e"],
    ["U+200F right-to-left mark", "\u200f"],
    ["U+202A left-to-right embedding", "\u202a"],
    ["U+202B right-to-left embedding", "\u202b"],
    ["U+202C pop directional formatting", "\u202c"],
    ["U+202D left-to-right override", "\u202d"],
    ["U+202E right-to-left override", "\u202e"],
    ["U+2060 word joiner", "\u2060"],
    ["U+2061 function application", "\u2061"],
    ["U+2066 left-to-right isolate", "\u2066"],
    ["U+2069 pop directional isolate", "\u2069"],
    ["U+2028 line separator", "\u2028"], // splitlines() boundary in old impl
    ["U+2029 paragraph separator", "\u2029"], // splitlines() boundary in old impl
    ["U+FEFF byte order mark", "\ufeff"],
  ];
  it.each(cases)("rejects %s", (_name, char) => {
    const findings = checkText(`safe ${char} looking\n`);
    expect(findings).toHaveLength(1);
    expect(findings[0].label).toMatch(/invisible or control character/);
  });
});

describe("base64 threshold", () => {
  const run = (n: number) => "QUFB".repeat(Math.ceil(n / 4)).slice(0, n);

  it("accepts a 119-character run", () => {
    expect(checkText(`payload ${run(119)}\n`)).toEqual([]);
  });

  it("rejects a 120-character run", () => {
    const findings = checkText(`payload ${run(120)}\n`);
    expect(labels(findings)).toContain("long base64 run");
  });

  it("rejects a padded run", () => {
    expect(checkText(`${run(120)}==\n`)).toHaveLength(1);
  });
});

describe("malformed UTF-8", () => {
  it("rejects invalid byte sequences", () => {
    const findings = checkBytes(Buffer.from([0x68, 0x69, 0xc0, 0xaf]));
    expect(findings).toHaveLength(1);
    expect(findings[0].label).toMatch(/not valid UTF-8/);
  });

  it("accepts valid UTF-8 bytes", () => {
    expect(checkBytes(Buffer.from("héllo\n", "utf-8"))).toEqual([]);
  });
});

describe("finding locations", () => {
  it("reports 1-indexed line numbers", () => {
    const findings = checkText("clean\nclean\nbad\u200bline\n");
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(3);
  });

  it("reports one finding per pattern per line", () => {
    // Two invisible characters on one line collapse into one finding.
    const findings = checkText("\u200b\u200b and \u202e\n");
    expect(findings).toHaveLength(1);
  });
});

describe("the shipped skill tree", () => {
  it("scans clean", () => {
    expect(scanTree(new URL("..", import.meta.url).pathname)).toEqual([]);
  });
});
