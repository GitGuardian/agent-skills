import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseMarkdown, checkLinks, checkReferences } from "../scripts/check-references.mjs";

const roots: string[] = [];
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "skill reference tests "));
  roots.push(root);
  for (const [name, body] of Object.entries(files)) put(root, name, body);
  return root;
}
function put(root: string, name: string, body: string) {
  mkdirSync(join(root, name, ".."), { recursive: true });
  writeFileSync(join(root, name), body);
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe("Markdown reference parsing", () => {
  it("uses rendered heading text and GitHub duplicate slugs", () => {
    const doc = parseMarkdown("# **Triage** `flow`\n# Triage flow\n# Triage flow-1\n# Café — 日本語\n\nSetext heading\n---\n");
    expect([...doc.anchors]).toEqual(["triage-flow", "triage-flow-1", "triage-flow-1-1", "café--日本語", "setext-heading"]);
  });
  it("resolves reference-style links and excludes code examples", () => {
    const doc = parseMarkdown("[Guide][g]\n\n[g]: <a b.md#section>\n\n`[fake](missing.md)`\n\n```md\n# Hidden\n[fake](missing.md)\n```\n");
    expect(doc.links.map((x: { href: string }) => x.href)).toEqual(["a%20b.md#section"]);
    expect([...doc.anchors]).toEqual([]);
  });
  it("collects image references and explicit HTML anchors", () => {
    const doc = parseMarkdown('<a id="manual"></a>\n\n![diagram](chart.svg)\n');
    expect([...doc.anchors]).toContain("manual");
    expect(doc.links.map((x: { href: string }) => x.href)).toEqual(["chart.svg"]);
  });
  it("does not parse frontmatter as a setext heading", () => {
    expect([...parseMarkdown('---\nname: test\n---\n# Real\n').anchors]).toEqual(["real"]);
  });
  it("ignores commented HTML links and anchors", () => {
    const doc = parseMarkdown('<!-- <a id="removed" href="missing.md">old</a> -->\n');
    expect([...doc.anchors]).toEqual([]);
    expect(doc.links).toEqual([]);
    const root = fixture({ "README.md": '<!-- <a id="removed"></a> -->\n\n[bad](#removed)\n' });
    expect(checkLinks(root, ["README.md"])[0].message).toContain("missing anchor");
  });
  it("requires exact HTML attributes and decodes character references", () => {
    const doc = parseMarkdown('<a data-id="fake" data-href="missing.md" id="a&amp;b" href="a&amp;b.md">link</a>\n');
    expect([...doc.anchors]).toEqual(["a&b"]);
    expect(doc.links.map((x: { href: string }) => x.href)).toEqual(["a&b.md"]);
  });
});

describe("reference validation", () => {
  it("resolves encoded paths and anchors without making network requests", () => {
    const root = fixture({ "README.md": "[OK](a%20b.md#caf%C3%A9)\n[web](https://example.invalid)\n", "a b.md": "# Café\n" });
    expect(checkLinks(root, ["README.md"])).toEqual([]);
  });
  it("reports missing files with the source line", () => {
    const root = fixture({ "README.md": "# Test\n\n[bad](missing.md)\n" });
    expect(checkLinks(root, ["README.md"])).toEqual([expect.objectContaining({ file: "README.md", line: 3, message: expect.stringContaining("missing file") })]);
  });
  it("reports stale section anchors after moving a heading", () => {
    const root = fixture({ "README.md": "[bad](guide.md#old)\n", "guide.md": "# New\n" });
    expect(checkLinks(root, ["README.md"])[0].message).toContain("missing anchor");
  });
  it("keeps an individually installed skill self-contained", () => {
    const root = fixture({ "skills/one/SKILL.md": "[bad](../two/references/shared.md)\n", "skills/two/references/shared.md": "# Shared\n" });
    expect(checkLinks(root, ["skills/one/SKILL.md"])[0].message).toContain("outside owning skill");
  });
  it("allows references to return to their own SKILL.md", () => {
    const root = fixture({ "skills/one/SKILL.md": "# Entry\n", "skills/one/references/guide.md": "[entry](../SKILL.md#entry)\n" });
    expect(checkLinks(root, ["skills/one/references/guide.md"])).toEqual([]);
  });
  it("detects a symlink that escapes the installed skill", () => {
    const root = fixture({ "skills/one/SKILL.md": "[bad](shared.md)\n", "shared.md": "# Outside\n" });
    symlinkSync(join(root, "shared.md"), join(root, "skills/one/shared.md"));
    expect(checkLinks(root, ["skills/one/SKILL.md"])[0].message).toContain("outside owning skill");
  });
});

function publishedFixture() {
  const files: Record<string, string> = {};
  for (const skill of ["scan-secrets", "triage-incidents"]) {
    const published = {
      "SKILL.md": "[policy](references/policy.md)\n",
      "references/policy.md": `# ${skill} policy\n[exceptions](exceptions.md)\n`,
      "references/exceptions.md": "# Exceptions\n",
    };
    for (const [name, content] of Object.entries(published)) {
      files[`skills/${skill}/${name}`] = content;
      files[`kiro/skills/${skill}/${name}`] = content;
    }
  }
  return fixture(files);
}
describe("published skill validation", () => {
  it("accepts self-contained skills with different policies and an indirect optional reference", () => {
    expect(checkReferences(publishedFixture())).toEqual([]);
  });
  it("reports a missing distribution copy", () => {
    const root = publishedFixture();
    rmSync(join(root, "kiro/skills/scan-secrets/references/exceptions.md"));
    expect(checkReferences(root).some((x: { message: string }) => x.message.includes("missing Kiro copy"))).toBe(true);
  });
  it("detects changed content in a distribution copy", () => {
    const root = publishedFixture();
    put(root, "kiro/skills/scan-secrets/references/exceptions.md", "# Drift\n");
    expect(checkReferences(root).some((x: { message: string }) => x.message.includes("Kiro copy differs"))).toBe(true);
  });
  it("rejects stale distribution files after their source was removed", () => {
    const root = publishedFixture();
    put(root, "kiro/skills/scan-secrets/references/retired.md", "# Old guidance\n");
    expect(checkReferences(root).some((x: { message: string }) => x.message.includes("no source counterpart"))).toBe(true);
  });
  it("checks nested supporting files and entrypoints as part of the published copy", () => {
    const root = publishedFixture();
    put(root, "skills/scan-secrets/references/examples/config.txt", "example");
    put(root, "kiro/skills/scan-secrets/SKILL.md", "# Changed entrypoint\n");
    const findings = checkReferences(root);
    expect(findings.some((x: { file: string, message: string }) => x.file.endsWith("config.txt") && x.message.includes("missing Kiro copy"))).toBe(true);
    expect(findings.some((x: { file: string, message: string }) => x.file.endsWith("SKILL.md") && x.message.includes("Kiro copy differs"))).toBe(true);
  });
  it("validates standalone source skills without requiring a Kiro distribution", () => {
    const root = publishedFixture();
    rmSync(join(root, "kiro"), { recursive: true });
    expect(checkReferences(root)).toEqual([]);
  });
  it("checks the repository's published references", () => {
    expect(checkReferences(resolve(import.meta.dirname, ".."))).toEqual([]);
  });
});
