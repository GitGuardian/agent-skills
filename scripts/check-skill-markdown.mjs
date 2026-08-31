// Reject characters a human reviewer cannot see in skill markdown.
//
// Skill prose is instructions the agent follows, so anything invisible in a
// diff is smuggling surface (OWASP Agentic Skills Top 10, AST04 "Insecure
// Metadata"): zero-width and bidi characters hide instructions inside an
// innocent-looking change, and long base64 runs carry payloads past review.
// Nothing in legitimate skill content needs any of these.
//
// Matching is by Unicode category, not a hand-kept range table: Cc (control,
// except tab and newline), Cf (invisible format characters — zero-width
// spaces and joiners, bidi controls, U+061C, BOM, soft hyphen), and Zl/Zp
// (line and paragraph separators). New invisible characters added to Unicode
// land in these categories, so the policy does not go stale.
//
// Lines are split on "\n" only. Every other line-boundary character
// (U+000B, U+000C, U+001C–U+001E, U+0085, U+2028, U+2029) is itself banned,
// so nothing can hide by acting as a line break.
//
// Exercised by test/skill-markdown.test.ts (table-driven over the full
// prohibited ranges); run by the validate workflow.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const INVISIBLE = /(?!\t)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// A base64 run of 120+ characters has no business in skill prose.
const BASE64 = /[A-Za-z0-9+/]{120,}={0,2}/;

const codepoint = (ch) =>
  "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");

/** Check decoded text. Returns findings: {line, label, sample}. */
export function checkText(text) {
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const invisible = INVISIBLE.exec(line);
    if (invisible) {
      findings.push({
        line: i + 1,
        label: `invisible or control character ${codepoint(invisible[0])}`,
        sample: "",
      });
    }
    const base64 = BASE64.exec(line);
    if (base64) {
      findings.push({
        line: i + 1,
        label: "long base64 run",
        sample: base64[0].slice(0, 40),
      });
    }
  }
  return findings;
}

/** Check raw file bytes: UTF-8 validity first, then the text rules. */
export function checkBytes(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return [{ line: 1, label: "not valid UTF-8", sample: "" }];
  }
  return checkText(text);
}

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(path);
    else if (entry.name.endsWith(".md")) yield path;
  }
}

/** Scan skills/ and kiro/skills/ under root. Returns findings with .file. */
export function scanTree(root) {
  const findings = [];
  for (const base of ["skills", "kiro/skills"]) {
    for (const file of markdownFiles(join(root, base))) {
      for (const f of checkBytes(readFileSync(file))) {
        findings.push({ ...f, file: relative(root, file) });
      }
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanTree(process.cwd());
  for (const f of findings) {
    console.log(`::error file=${f.file},line=${f.line}::${f.label}${f.sample ? `: ${f.sample}` : ""}`);
  }
  if (findings.length > 0) {
    console.error(`${findings.length} finding(s) - see annotations above`);
    process.exit(1);
  }
  console.log("skill markdown is clean");
}
