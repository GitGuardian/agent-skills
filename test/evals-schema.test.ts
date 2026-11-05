// Cheap, deterministic validation of the eval definitions — the per-PR
// counterpart to the expensive behavioral runs in .github/workflows/evals.yml.
// Catches the drift the behavioral loop only surfaces after spending API
// money: malformed suites, duplicate ids, dangling fixture paths, and
// skill_name mismatches.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");
const SKILLS_DIR = join(REPO_ROOT, "skills");

type Assertion = { id: string; text: string };
type EvalCase = {
  id: number;
  name: string;
  prompt: string;
  expected_output: string;
  files: string[];
  assertions: Assertion[];
};
type EvalSuite = { skill_name: string; evals: EvalCase[] };

const skillsWithEvals = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(SKILLS_DIR, name, "evals", "evals.json")))
  .sort();

describe("eval suite coverage", () => {
  it("every skill ships an eval suite", () => {
    const allSkills = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => existsSync(join(SKILLS_DIR, e.name, "SKILL.md")))
      .map((e) => e.name)
      .sort();
    expect(skillsWithEvals).toEqual(allSkills);
  });
});

describe.each(skillsWithEvals)("skills/%s/evals", (skill) => {
  const evalsDir = join(SKILLS_DIR, skill, "evals");
  const suite: EvalSuite = JSON.parse(
    readFileSync(join(evalsDir, "evals.json"), "utf8"),
  );

  it("skill_name matches the skill directory", () => {
    expect(suite.skill_name).toBe(skill);
  });

  it("has a non-empty evals array with unique integer ids", () => {
    expect(Array.isArray(suite.evals)).toBe(true);
    expect(suite.evals.length).toBeGreaterThan(0);
    const ids = suite.evals.map((e) => e.id);
    expect(ids.every((id) => Number.isInteger(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every eval has a prompt, expected_output, and non-empty assertions", () => {
    for (const evalCase of suite.evals) {
      const label = `${skill}#${evalCase.id}`;
      expect(evalCase.name?.trim(), label).toBeTruthy();
      expect(evalCase.prompt?.trim(), label).toBeTruthy();
      expect(evalCase.expected_output?.trim(), label).toBeTruthy();
      expect(Array.isArray(evalCase.assertions), label).toBe(true);
      expect(evalCase.assertions.length, label).toBeGreaterThan(0);
      const assertionIds = evalCase.assertions.map((a) => a.id);
      expect(new Set(assertionIds).size, label).toBe(assertionIds.length);
      for (const assertion of evalCase.assertions) {
        expect(assertion.id?.trim(), label).toBeTruthy();
        expect(assertion.text?.trim(), label).toBeTruthy();
      }
    }
  });

  it("every referenced fixture exists (dirs carry a setup.sh recipe)", () => {
    for (const evalCase of suite.evals) {
      for (const entry of evalCase.files ?? []) {
        const src = join(SKILLS_DIR, skill, entry.replace(/\/$/, ""));
        expect(existsSync(src), `${skill}#${evalCase.id}: ${entry}`).toBe(true);
        if (statSync(src).isDirectory()) {
          expect(
            existsSync(join(src, "setup.sh")),
            `${skill}#${evalCase.id}: ${entry} is a directory without setup.sh`,
          ).toBe(true);
        }
      }
    }
  });

  it("targets.json declares a claude model matrix", () => {
    const targets = JSON.parse(
      readFileSync(join(evalsDir, "targets.json"), "utf8"),
    );
    expect(Array.isArray(targets.claude)).toBe(true);
    expect(targets.claude.length).toBeGreaterThan(0);
  });
});
