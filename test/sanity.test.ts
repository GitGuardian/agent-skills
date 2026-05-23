import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");
const SKILLS_DIR = join(REPO_ROOT, "skills");

function discoverSkills(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(SKILLS_DIR, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

type InstallResult = {
  exitCode: number;
  output: string;
  installedSkills: string[];
  installDir: string;
};

function runSkillsAdd(skillName?: string): InstallResult {
  const installDir = mkdtempSync(join(tmpdir(), "gitguardian-agent-skills-"));
  const skillArg = skillName ? ` --skill ${skillName}` : "";
  let output = "";
  let exitCode = 0;
  try {
    output = execSync(
      `npx --yes skills add ${REPO_ROOT} -a claude-code -y${skillArg}`,
      {
        cwd: installDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      },
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    exitCode = e.status ?? 1;
  }

  const claudeSkillsDir = join(installDir, ".claude", "skills");
  const installedSkills = existsSync(claudeSkillsDir)
    ? readdirSync(claudeSkillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

  return { exitCode, output, installedSkills, installDir };
}

describe("agent-skills sanity check", () => {
  const expectedSkills = discoverSkills();
  const cleanupDirs: string[] = [];

  let installAll: InstallResult;
  beforeAll(() => {
    installAll = runSkillsAdd();
    cleanupDirs.push(installAll.installDir);
  });

  afterAll(() => {
    for (const dir of cleanupDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discovers at least one skill on disk", () => {
    expect(expectedSkills.length).toBeGreaterThan(0);
  });

  it("every discovered skill has SKILL.md frontmatter with name + description", () => {
    for (const skill of expectedSkills) {
      const skillMd = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
      expect(skillMd.startsWith("---\n"), `${skill}/SKILL.md missing frontmatter opener`).toBe(true);
      expect(skillMd, `${skill}/SKILL.md missing name:`).toMatch(/^name:\s*\S+/m);
      expect(skillMd, `${skill}/SKILL.md missing description:`).toMatch(/^description:\s*\S+/m);
    }
  });

  it("`npx skills add` succeeds against this repo", () => {
    if (installAll.exitCode !== 0) {
      console.error("skills add failed. Output:\n", installAll.output);
    }
    expect(installAll.exitCode).toBe(0);
  });

  it("installs every discovered skill into .claude/skills/", () => {
    expect(installAll.installedSkills).toEqual(expectedSkills);
  });

  it("each installed skill has a SKILL.md", () => {
    for (const skill of installAll.installedSkills) {
      const skillMd = join(installAll.installDir, ".claude", "skills", skill, "SKILL.md");
      expect(existsSync(skillMd), `missing ${skillMd}`).toBe(true);
    }
  });

  it.each(discoverSkills())("installs only `%s` when --skill is passed", (skill) => {
    const result = runSkillsAdd(skill);
    cleanupDirs.push(result.installDir);
    expect(result.exitCode).toBe(0);
    expect(result.installedSkills).toEqual([skill]);
  });
});
