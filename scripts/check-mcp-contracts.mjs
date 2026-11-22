// Check every skill against the tool contracts of the pinned ggmcp version.
//
// Skills name ggmcp tools, their arguments, enum values and output fields in
// prose, reference tables and evals. Nothing else ties those names to the
// server, so a renamed tool or a REST-only parameter documented as an MCP
// argument only shows up when a user hits it. This script reads the
// contracts (tool-contracts.json: every tool with its input and output JSON
// schema, see scripts/dump-mcp-contracts.py) and reports each name the
// schemas disprove, as file:line with the nearest valid name.
//
// Extraction is conservative on purpose: a name is checked only when its
// context ties it to exactly one tool.
//
//   - Tool names: a backticked identifier equal to a tool name is a tool
//     reference. A backticked identifier shaped like a tool name (a tool
//     verb followed only by words from tool names, such as `list_incidents`)
//     that is not a tool, argument or output field is reported as an unknown
//     tool. In evals JSON, bare tool names count too.
//   - Parameter tables: a markdown table with a column headed Arguments,
//     Parameters, Inputs or Filters, bound to a tool by a tool cell in the
//     row or, failing that, by the one tool the paragraph above the table
//     names. Backticked names in that column are arguments; backticked
//     values in parentheses or after "`arg`:" are enum values. A column
//     headed Returns, Output or Fields lists output fields.
//   - Prose: in a sentence (or table cell) that names exactly one tool,
//     `arg: value` / `arg=value`, "`tool` with `arg`", "pass `arg`" and the
//     bare "with some_arg" of evals name arguments; backticked names after
//     "returns" / "returned" name output fields.
//
// Output fields are only reported when the schema can disprove them: a name
// absent from a closed object is wrong, but a name that may sit inside an
// open object (additionalProperties: true) is not, unless it is listed next
// to a real top-level field ("Returns `honeytokens[]`, `next_cursor`").
//
// Allow-list: skills/<skill>/evals/mcp-contracts-allow.json, see
// docs/maintainers/contributing.md. kiro/ is a legacy copy and is skipped.
//
// Usage: node scripts/check-mcp-contracts.mjs <tool-contracts.json>
// Exercised by test/mcp-contracts.test.ts.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ALLOW_FILE = "mcp-contracts-allow.json";

const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

// ---------------------------------------------------------------- contracts

function resolveRef(schema, root) {
  let s = schema;
  const seen = new Set();
  while (s && typeof s.$ref === "string" && !seen.has(s.$ref)) {
    seen.add(s.$ref);
    const path = s.$ref.replace(/^#\//, "").split("/");
    s = path.reduce((node, key) => (node ? node[key] : undefined), root);
  }
  return s ?? {};
}

/** Every branch of a schema: anyOf/oneOf/allOf and array items flattened. */
function branches(schema, root, depth = 0) {
  const s = resolveRef(schema, root);
  if (depth > 8) return [s];
  const out = [];
  const subs = [...(s.anyOf ?? []), ...(s.oneOf ?? []), ...(s.allOf ?? [])];
  if (subs.length) for (const sub of subs) out.push(...branches(sub, root, depth + 1));
  else if (s.type === "array" || s.items) out.push(...branches(s.items ?? {}, root, depth + 1));
  else out.push(s);
  return out;
}

function enumValues(schema, root) {
  const values = [];
  for (const b of branches(schema, root)) {
    if (Array.isArray(b.enum)) values.push(...b.enum);
    if (b.const !== undefined) values.push(b.const);
  }
  return values.filter((v) => v !== null).map(String);
}

/** Objects reachable from a schema, with whether each is open to extra keys. */
function objectsOf(schema, root) {
  return branches(schema, root).filter((b) => b.type === "object" || b.properties);
}

const isOpen = (obj) => !obj.properties || obj.additionalProperties === true ||
  (typeof obj.additionalProperties === "object" && obj.additionalProperties !== null);

/** All property names at any depth, and whether any open object exists. */
function walkOutput(schema, root) {
  const names = new Set();
  let open = false;
  const seen = new Set();
  const visit = (s, depth) => {
    if (depth > 10) return;
    for (const obj of objectsOf(s, root)) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      if (isOpen(obj)) open = true;
      for (const [k, v] of Object.entries(obj.properties ?? {})) {
        names.add(k);
        visit(v, depth + 1);
      }
    }
  };
  visit(schema, 0);
  return { names, open };
}

/** Index a parsed tool-contracts.json for lookups. */
export function loadContracts(data) {
  const tools = new Map();
  const allArgs = new Set();
  const allOutputs = new Set();
  for (const t of data.tools ?? []) {
    const input = t.inputSchema ?? t.input_schema ?? {};
    const output = t.outputSchema ?? t.output_schema ?? null;
    const args = new Map();
    for (const [name, prop] of Object.entries(input.properties ?? {})) {
      args.set(name, { enum: enumValues(prop, input) });
      allArgs.add(name);
    }
    const top = new Map();
    let topOpen = true;
    let deep = { names: new Set(), open: true };
    if (output) {
      const objs = objectsOf(output, output);
      topOpen = objs.length === 0 || objs.some(isOpen);
      for (const obj of objs) {
        for (const [k, v] of Object.entries(obj.properties ?? {})) top.set(k, v);
      }
      deep = walkOutput(output, output);
      for (const n of deep.names) allOutputs.add(n);
    }
    tools.set(t.name, {
      name: t.name,
      args,
      argsOpen: input.additionalProperties !== false && !input.properties,
      output,
      top,
      topOpen,
      deepNames: deep.names,
      deepOpen: deep.open,
    });
  }
  const names = [...tools.keys()];
  const verbs = new Set(names.map((n) => n.split("_")[0]));
  const vocab = new Set(names.flatMap((n) => n.split("_").slice(1)));
  return { version: data.version, tools, names, verbs, vocab, allArgs, allOutputs };
}

// ---------------------------------------------------------------- helpers

export function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** The closest candidate, or null when none is plausibly a typo or rename. */
export function nearest(name, candidates) {
  let best = null;
  let bestScore = Infinity;
  const words = new Set(name.split("_"));
  for (const c of candidates) {
    // Shared words count for more than raw edit distance: list_incidents is
    // closer to list_internal_incidents than to list_detectors.
    const shared = c.split("_").filter((w) => words.has(w)).length;
    const distance = levenshtein(name, c);
    if (shared === 0 && distance > Math.max(2, Math.floor(name.length / 3))) continue;
    const score = distance - 2 * shared;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** "nearest: `x`" when one is plausible, else the valid names. */
function suggestion(name, candidates) {
  const near = nearest(name, candidates);
  if (near) return `nearest: \`${near}\``;
  if (candidates.length === 0) return "it takes none";
  const list = [...candidates].sort();
  const shown = list.slice(0, 12).map((c) => `\`${c}\``).join(", ");
  return `valid: ${shown}${list.length > 12 ? ", ..." : ""}`;
}

/** Strip a server prefix: GitGuardian:scan_secrets, mcp__x__scan_secrets. */
function bareToolName(token) {
  return token.replace(/^mcp__.+__/, "").replace(/^[A-Za-z][\w-]*:(?=[a-z])/, "");
}

/** Backticked spans of a text: [{text, index, end}]. */
function backticks(text) {
  const spans = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(text))) spans.push({ text: m[1].trim(), index: m.index, end: re.lastIndex });
  return spans;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Normalise an argument/field token: `per_page: 1` -> {name, value}. */
function parseNamed(token) {
  const m = /^([a-z][a-z0-9_]*)(\[\])?(?:\s*(?::\s+|=)\s*(.+))?$/.exec(token);
  if (!m) return null;
  let value = m[3]?.trim();
  if (value) value = value.replace(/^["']|["']$/g, "");
  return { name: m[1], value };
}

// ---------------------------------------------------------------- extraction

/**
 * A unit is a piece of text with one context: a prose sentence or a table
 * cell. Each unit carries `tool` when the surrounding structure binds it to
 * one (a table row), and `role` for a table column ("args" / "outputs").
 */
function toolsIn(text, index, bare) {
  const found = new Set();
  for (const span of backticks(text)) {
    const n = bareToolName(span.text);
    if (index.tools.has(n)) found.add(n);
  }
  if (bare) {
    const re = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
    let m;
    while ((m = re.exec(text))) if (index.tools.has(m[0])) found.add(m[0]);
  }
  return found;
}

function splitSentences(text) {
  const parts = [];
  // Split after . ! or ? followed by whitespace, never inside backticks.
  let start = 0;
  let inTick = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "`") inTick = !inTick;
    else if (!inTick && /[.!?]/.test(ch) && /\s/.test(text[i + 1] ?? " ")) {
      parts.push({ text: text.slice(start, i + 1), offset: start });
      start = i + 1;
    }
  }
  if (start < text.length) parts.push({ text: text.slice(start), offset: start });
  return parts;
}

const RETURNS = /\b(?:returns?|returned|returning|responds? with|response (?:has|carries|contains))\b/i;

/** Mentions in one unit of text. */
function unitMentions(unit, index, bare) {
  const mentions = [];
  const spans = backticks(unit.text);
  const named = toolsIn(unit.text, index, bare);
  const tool = unit.tool ?? (named.size === 1 ? [...named][0] : null);

  // Tool references and tool-shaped unknowns.
  for (const span of spans) {
    const n = bareToolName(span.text);
    if (index.tools.has(n)) continue;
    if (!SNAKE.test(n)) continue;
    const [verb, ...rest] = n.split("_");
    if (!index.verbs.has(verb) || rest.length === 0) continue;
    if (!rest.every((w) => index.vocab.has(w))) continue;
    if (index.allArgs.has(n) || index.allOutputs.has(n)) continue;
    mentions.push({ kind: "tool", name: n, offset: span.index });
  }

  // "`tool` with `arg`" / "`tool` with `arg: value`" / "`tool` (`arg: value`)"
  // binds to that tool even when the sentence names others.
  const direct = /`([^`\n]+)`\s+(?:with\s+|\(\s*)`([a-z][a-z0-9_]*(?:(?::\s+|=)[^`\n]+)?)`/g;
  let d;
  while ((d = direct.exec(unit.text))) {
    const t = bareToolName(d[1]);
    if (!index.tools.has(t) || (unit.tool && unit.tool !== t)) continue;
    const parsed = parseNamed(d[2]);
    if (!parsed || index.tools.has(parsed.name)) continue;
    const off = d.index + d[0].length - d[2].length - 2;
    mentions.push({ kind: "arg", tool: t, name: parsed.name, offset: off });
    if (parsed.value) mentions.push({ kind: "enum", tool: t, arg: parsed.name, value: parsed.value, offset: off });
  }

  if (!tool) return mentions;

  // Column-driven roles (parameter tables).
  if (unit.role === "args") {
    // `arg` names an argument; backticked values in parentheses after it,
    // or after "`arg`:" up to the next ";", are its enum values.
    let depth = 0;
    let last = 0;
    let current = null;
    let colon = false;
    for (const span of spans) {
      const between = unit.text.slice(last, span.index);
      for (const ch of between) {
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
      }
      if (between.includes(";")) colon = false;
      last = span.end;
      if (index.tools.has(bareToolName(span.text))) continue;
      if ((depth > 0 || colon) && current) {
        mentions.push({ kind: "enum", tool, arg: current, value: span.text, offset: span.index });
        continue;
      }
      const parsed = parseNamed(span.text);
      if (!parsed) continue;
      mentions.push({ kind: "arg", tool, name: parsed.name, offset: span.index });
      if (parsed.value) mentions.push({ kind: "enum", tool, arg: parsed.name, value: parsed.value, offset: span.index });
      current = parsed.name;
      colon = /^\s*:/.test(unit.text.slice(span.end));
    }
    return mentions;
  }
  if (unit.role === "outputs") {
    const fields = [];
    for (const span of spans) {
      const path = /^([a-z][a-z0-9_]*)(?:\[\])?(?:\.|$)/.exec(span.text);
      if (path) fields.push({ name: path[1], offset: span.index });
    }
    if (fields.length) mentions.push({ kind: "outputs", tool, fields });
    return mentions;
  }

  // Prose. Output lists: backticked names after a "returns" verb, up to the
  // end of the unit or the next clause boundary.
  const ret = RETURNS.exec(unit.text);
  let outputRange = null;
  if (ret) {
    const from = ret.index + ret[0].length;
    const rest = unit.text.slice(from);
    const stop = rest.search(/[.;:](\s|$)|\b(?:and then|but|if|when|so)\b|—/);
    outputRange = [from, stop === -1 ? unit.text.length : from + stop];
    const fields = [];
    for (const span of spans) {
      if (span.index < outputRange[0] || span.index >= outputRange[1]) continue;
      if (index.tools.has(bareToolName(span.text))) continue;
      const path = /^([a-z][a-z0-9_]*)(?:\[\])?(?:\.[a-z0-9_.[\]]+)?(?::\s+.*)?$/.exec(span.text);
      if (path) fields.push({ name: path[1], offset: span.index });
    }
    if (fields.length) mentions.push({ kind: "outputs", tool, fields });
  }
  const inOutput = (off) => outputRange && off >= outputRange[0] && off < outputRange[1];

  // Arguments: `arg: value` / `arg=value`.
  for (const span of spans) {
    if (inOutput(span.index)) continue;
    const parsed = parseNamed(span.text);
    if (!parsed?.value) continue;
    mentions.push({ kind: "arg", tool, name: parsed.name, offset: span.index });
    mentions.push({ kind: "enum", tool, arg: parsed.name, value: parsed.value, offset: span.index });
  }
  // Arguments: "pass `arg`".
  const argRe = /\bpass(?:es|ed|ing)?\s+`([a-z][a-z0-9_]*)`/g;
  let m;
  while ((m = argRe.exec(unit.text))) {
    const name = m[1];
    const off = m.index + m[0].length - name.length - 2;
    if (inOutput(off) || index.tools.has(name)) continue;
    mentions.push({ kind: "arg", tool, name, offset: off });
  }
  // Evals: bare "with some_arg".
  if (bare) {
    const bareRe = /\bwith\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
    while ((m = bareRe.exec(unit.text))) {
      if (index.tools.has(m[1])) continue;
      mentions.push({ kind: "arg", tool, name: m[1], offset: m.index + m[0].length - m[1].length });
    }
  }
  return mentions;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = [];
  let start = 0;
  let inTick = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "`") inTick = !inTick;
    else if (s[i] === "|" && !inTick && s[i - 1] !== "\\") {
      cells.push({ text: s.slice(start, i), col: start });
      start = i + 1;
    }
  }
  cells.push({ text: s.slice(start), col: start });
  const lead = line.indexOf(line.trim()) + (line.trim().startsWith("|") ? 1 : 0);
  return cells.map((c) => ({ text: c.text, col: c.col + lead }));
}

const ARG_HEADER = /\b(?:arg|args|arguments?|param|params|parameters?|inputs?|filters?)\b/i;
const OUT_HEADER = /\b(?:returns?|outputs?|output fields?|result fields?|fields)\b/i;
const TOOL_HEADER = /\btools?\b/i;

/**
 * Extract every mention from one file's text.
 * @param {string} text file content
 * @param {object} index from loadContracts
 * @param {{bare?: boolean}} opts bare: also match unbackticked tool names (evals JSON)
 * @returns {{kind, line, ...}[]}
 */
export function extractMentions(text, index, { bare = false } = {}) {
  const lines = text.split("\n");
  const starts = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  const out = [];
  const push = (ms, base) => {
    for (const m of ms) {
      if (m.kind === "outputs") {
        out.push({ ...m, fields: m.fields.map((f) => ({ name: f.name, line: lineAt(starts, base + f.offset) })) });
      } else {
        const { offset, ...rest } = m;
        out.push({ ...rest, line: lineAt(starts, base + offset) });
      }
    }
  };

  let i = 0;
  let inFence = false;
  let paragraph = [];
  let lastParagraphTools = new Set();
  const flush = () => {
    if (!paragraph.length) return;
    const first = paragraph[0];
    const last = paragraph[paragraph.length - 1];
    const ptext = text.slice(starts[first], starts[last] + lines[last].length);
    lastParagraphTools = toolsIn(ptext, index, bare);
    for (const s of splitSentences(ptext)) {
      push(unitMentions({ text: s.text }, index, bare), starts[first] + s.offset);
    }
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence) {
      i++;
      continue;
    }
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l ?? "");
    if (isRow && isSep(lines[i + 1])) {
      flush();
      const header = splitRow(line).map((c) => c.text.trim());
      const roles = header.map((h) =>
        TOOL_HEADER.test(h) && !ARG_HEADER.test(h) ? "tool" : ARG_HEADER.test(h) ? "args" : OUT_HEADER.test(h) ? "outputs" : null,
      );
      const tableTool = lastParagraphTools.size === 1 ? [...lastParagraphTools][0] : null;
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        const cells = splitRow(lines[j]);
        const rowToolCell = cells.find((c, k) => roles[k] === "tool") ?? cells[0];
        const rowTools = toolsIn(rowToolCell?.text ?? "", index, false);
        const rowTool = rowTools.size === 1 ? [...rowTools][0] : rowTools.size === 0 ? tableTool : null;
        cells.forEach((cell, k) => {
          const base = starts[j] + cell.col;
          const role = roles[k] === "args" || roles[k] === "outputs" ? roles[k] : null;
          if (role && rowTool) {
            push(unitMentions({ text: cell.text, tool: rowTool, role }, index, false), base);
          } else if (rowTool && rowTools.size === 1) {
            for (const s of splitSentences(cell.text)) {
              push(unitMentions({ text: s.text, tool: rowTool }, index, false), base + s.offset);
            }
          } else {
            for (const s of splitSentences(cell.text)) {
              push(unitMentions({ text: s.text }, index, false), base + s.offset);
            }
          }
        });
        j++;
      }
      lastParagraphTools = new Set();
      i = j;
      continue;
    }
    if (line.trim() === "" || /^\s*#/.test(line)) {
      flush();
      if (/^\s*#/.test(line)) {
        push(unitMentions({ text: line }, index, bare), starts[i]);
        lastParagraphTools = new Set();
      }
    } else if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      flush();
      paragraph.push(i);
    } else if (bare) {
      // JSON: one line is one unit of text.
      flush();
      paragraph.push(i);
      flush();
    } else {
      paragraph.push(i);
    }
    i++;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- matching

/** Check mentions against the contracts. Returns findings {line, message}. */
export function checkMentions(mentions, index) {
  const findings = [];
  const seen = new Set();
  const report = (line, message) => {
    const key = `${line}:${message.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line, message });
  };
  for (const m of mentions) {
    if (m.kind === "tool") {
      report(m.line, {
        code: "unknown-tool", name: m.name,
        text: `\`${m.name}\` is not a ggmcp ${index.version ?? ""} tool; ${suggestion(m.name, index.names)}`,
      });
      continue;
    }
    const tool = index.tools.get(m.tool);
    if (!tool) continue;
    if (m.kind === "arg") {
      if (tool.args.has(m.name) || tool.argsOpen) continue;
      report(m.line, {
        code: "unknown-argument", tool: tool.name, name: m.name,
        text: `\`${tool.name}\` takes no argument \`${m.name}\`; ${suggestion(m.name, [...tool.args.keys()])}`,
      });
    } else if (m.kind === "enum") {
      const arg = tool.args.get(m.arg);
      if (!arg || arg.enum.length === 0) continue;
      const value = String(m.value).replace(/^["']|["']$/g, "");
      if (!/^-?[A-Za-z_][\w-]*$/.test(value)) continue;
      if (arg.enum.includes(value)) continue;
      report(m.line, {
        code: "unknown-enum-value", tool: tool.name, arg: m.arg, name: value,
        text: `\`${tool.name}\` argument \`${m.arg}\` rejects \`${value}\`; ${suggestion(value, arg.enum)}`,
      });
    } else if (m.kind === "outputs") {
      if (!tool.output) continue;
      const anyTop = m.fields.some((f) => tool.top.has(f.name));
      for (const f of m.fields) {
        if (tool.top.has(f.name)) continue;
        if (tool.topOpen) continue;
        // A name that may live inside an open nested object is only wrong
        // when the doc lists it beside real top-level fields.
        if (!anyTop && (tool.deepNames.has(f.name) || tool.deepOpen)) continue;
        report(f.line, {
          code: "unknown-output-field", tool: tool.name, name: f.name,
          text: `\`${tool.name}\` returns no field \`${f.name}\`; ${suggestion(f.name, [...tool.top.keys()])}`,
        });
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------- tree scan

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Files to check for one skill: SKILL.md, references/**, evals/** (md and json). */
export function skillFiles(skillDir) {
  const files = [];
  if (existsSync(join(skillDir, "SKILL.md"))) files.push(join(skillDir, "SKILL.md"));
  for (const sub of ["references", "evals"]) {
    for (const f of walk(join(skillDir, sub))) {
      if (f.endsWith(ALLOW_FILE)) continue;
      if (f.endsWith(".md") || (sub === "evals" && f.endsWith(".json"))) files.push(f);
    }
  }
  return files.sort();
}

/** Load a skill's allow-list: [{name, tool?, file?, reason}]. */
export function loadAllowList(skillDir) {
  const path = join(skillDir, "evals", ALLOW_FILE);
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8"));
  const entries = data.allow ?? [];
  for (const e of entries) {
    if (!e.name || !e.reason) throw new Error(`${path}: every entry needs "name" and "reason"`);
  }
  return entries;
}

export function isAllowed(finding, file, allow) {
  return allow.some(
    (e) =>
      e.name === finding.message.name &&
      (!e.tool || e.tool === finding.message.tool) &&
      (!e.file || file.endsWith(e.file.split("/").join(sep))),
  );
}

/** Check every skill under root/skills. kiro/ is never read. */
export function scanTree(root, index) {
  const findings = [];
  const skillsDir = join(root, "skills");
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(skillsDir, entry.name);
    const allow = loadAllowList(skillDir);
    for (const file of skillFiles(skillDir)) {
      const rel = relative(root, file);
      const mentions = extractMentions(readFileSync(file, "utf8"), index, { bare: file.endsWith(".json") });
      for (const f of checkMentions(mentions, index)) {
        if (!isAllowed(f, rel, allow)) findings.push({ file: rel, ...f });
      }
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const contractsPath = process.argv[2];
  if (!contractsPath) {
    console.error("usage: node scripts/check-mcp-contracts.mjs <tool-contracts.json>");
    process.exit(2);
  }
  const index = loadContracts(JSON.parse(readFileSync(contractsPath, "utf8")));
  if (index.tools.size === 0) {
    console.error(`${contractsPath} lists no tools`);
    process.exit(2);
  }
  const findings = scanTree(process.cwd(), index);
  for (const f of findings) {
    console.log(`::error file=${f.file},line=${f.line}::${f.message.text}`);
    console.log(`${f.file}:${f.line}: ${f.message.text}`);
  }
  if (findings.length > 0) {
    console.error(`${findings.length} mismatch(es) against ggmcp ${index.version} tool contracts`);
    process.exit(1);
  }
  console.log(`skills match the ggmcp ${index.version} tool contracts (${index.tools.size} tools)`);
}
