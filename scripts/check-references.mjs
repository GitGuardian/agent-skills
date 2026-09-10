#!/usr/bin/env node
// Validate the Markdown shipped to users, without fetching external URLs.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import GithubSlugger from "github-slugger";
import { Parser } from "htmlparser2";

const markdown = new MarkdownIt({ html: true });

export function parseMarkdown(source) {
  // Preserve line numbers, but do not turn YAML into a setext heading.
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, match => match.replace(/[^\r\n]/g, ""));
  const tokens = markdown.parse(body, {});
  const slugger = new GithubSlugger();
  const anchors = new Set();
  const links = [];
  const renderedText = children => (children ?? []).map(token => {
    if (["text", "code_inline"].includes(token.type)) return token.content;
    if (["softbreak", "hardbreak"].includes(token.type)) return " ";
    if (token.type === "image") return renderedText(token.children);
    return "";
  }).join("");
  const visit = (token, line) => {
    if (token.type === "link_open") links.push({ href: token.attrGet("href"), line });
    if (token.type === "image") links.push({ href: token.attrGet("src"), line });
    if (["html_inline", "html_block"].includes(token.type)) {
      // Parse actual tags/attributes, excluding comments, data-* and raw script text.
      const parser = new Parser({ onopentag(name, attrs) {
        if (attrs.id) anchors.add(attrs.id);
        if (name === "a" && attrs.name) anchors.add(attrs.name);
        for (const attribute of ["href", "src"]) {
          if (attrs[attribute]) links.push({ href: attrs[attribute], line });
        }
      } });
      parser.end(token.content);
    }
    for (const child of token.children ?? []) visit(child, line);
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "heading_open") anchors.add(slugger.slug(renderedText(tokens[index + 1]?.children)));
    visit(token, (token.map?.[0] ?? 0) + 1);
  }
  return { anchors, links };
}

function localTarget(root, file, href) {
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const hashIndex = href.indexOf("#");
  const beforeHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const path = decodeURIComponent(beforeHash.split("?")[0]);
  const anchor = hashIndex < 0 ? "" : decodeURIComponent(href.slice(hashIndex + 1));
  const target = path.startsWith("/") ? resolve(root, `.${path}`) : resolve(root, dirname(file), path || file.split(/[\\/]/).at(-1));
  return { target, anchor };
}

function within(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export function checkLinks(root, files) {
  const findings = [];
  const parsed = new Map();
  const document = path => {
    if (!parsed.has(path)) parsed.set(path, parseMarkdown(readFileSync(path, "utf8")));
    return parsed.get(path);
  };
  for (const file of files) {
    const owner = file.replaceAll("\\", "/").match(/^(?:kiro\/)?skills\/[^/]+/);
    for (const link of document(resolve(root, file)).links) {
      const report = message => findings.push({ file, line: link.line, message: `${message}: ${link.href}` });
      let destination;
      try { destination = localTarget(root, file, link.href); }
      catch { report("invalid URL encoding"); continue; }
      if (!destination) continue;
      const { target, anchor } = destination;
      if (!existsSync(target)) { report("missing file"); continue; }
      const canonical = realpathSync(target);
      if (!within(realpathSync(root), canonical)) { report("reference outside repository"); continue; }
      if (owner && !within(realpathSync(resolve(root, owner[0])), canonical)) {
        report("reference outside owning skill"); continue;
      }
      if (anchor && /\.md$/i.test(target) && statSync(target).isFile() && !document(target).anchors.has(anchor)) report("missing anchor");
    }
  }
  return findings;
}

function supportingFiles(root, directory) {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? supportingFiles(root, file) : entry.isFile() ? [file] : [];
  });
}

function publishedFiles(root, distribution) {
  if (!existsSync(join(root, distribution))) return [];
  return readdirSync(join(root, distribution), { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return [];
    const directory = join(distribution, entry.name);
    return [join(directory, "SKILL.md"), ...supportingFiles(root, join(directory, "references"))];
  });
}

export function checkSkillMirrors(root) {
  if (!existsSync(join(root, "kiro/skills"))) return [];
  const source = new Set(publishedFiles(root, "skills"));
  const mirrors = new Set(publishedFiles(root, "kiro/skills"));
  const findings = [];
  for (const file of source) {
    const mirror = join("kiro", file);
    if (!existsSync(join(root, file))) findings.push({ file, line: 1, message: "missing skill entrypoint" });
    else if (!existsSync(join(root, mirror))) findings.push({ file: mirror, line: 1, message: `missing Kiro copy: ${file}` });
    else if (!readFileSync(join(root, file)).equals(readFileSync(join(root, mirror)))) {
      findings.push({ file: mirror, line: 1, message: `Kiro copy differs: ${file}` });
    }
  }
  for (const file of mirrors) {
    if (!source.has(relative("kiro", file))) findings.push({ file, line: 1, message: "Kiro file has no source counterpart" });
  }
  return findings;
}

function markdownFiles(root, directory) {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(root, path) : entry.isFile() && path.endsWith(".md") ? [path] : [];
  });
}

export function checkReferences(root) {
  const files = ["README.md", "AGENTS.md"].filter(file => existsSync(join(root, file)));
  files.push(...markdownFiles(root, "docs/maintainers"));
  for (const distribution of ["skills", "kiro/skills"]) {
    if (!existsSync(join(root, distribution))) continue;
    for (const entry of readdirSync(join(root, distribution), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(distribution, entry.name);
      const entrypoint = join(directory, "SKILL.md");
      if (existsSync(join(root, entrypoint))) files.push(entrypoint);
      files.push(...markdownFiles(root, join(directory, "references")));
    }
  }
  return [...checkLinks(root, files), ...checkSkillMirrors(root)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const findings = checkReferences(process.cwd());
  for (const { file, line, message } of findings) console.error(`${file}:${line}: ${message}`);
  if (findings.length) process.exitCode = 1;
  else console.log("Reference links, anchors, skill isolation, and Kiro parity passed.");
}
