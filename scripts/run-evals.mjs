#!/usr/bin/env node
// Headless driver for the skill eval suites — local on-demand and CI.
//
// The canonical eval definitions stay in skills/<skill>/evals/evals.json in
// the skill-creator format (assertions as {id, text} objects, fixture dirs
// with setup.sh build recipes). This driver adapts them for the
// agent-skill-eval harness (https://github.com/tardigrde/agent-skill-eval):
//
//   1. builds each fixture with its setup.sh into a staging area
//      (eval-workspace/ase/<skill>/files/<case>/), so the harness workspace
//      root becomes the fixture repo itself (.git included);
//   2. converts assertions to the plain strings ase expects;
//   3. runs `ase validate` and (unless --dry-run) `ase run` + `ase report`.
//
// Usage:
//   node scripts/run-evals.mjs [--skill <name>]... [--eval-id <id>]...
//     [--model <id>] [--runs N] [--agent <name>] [--dry-run] [--no-report]
//     [-- <extra args passed verbatim to `ase run`>]
//
// Credentials (see docs/maintainers/evals.md):
//   ANTHROPIC_API_KEY    required for the claude-code agent runs
//   GITGUARDIAN_API_KEY  required for the scan-secrets suite (real scans)
//   OPENROUTER_API_KEY / OPENAI_API_KEY  LLM rubric grader; when neither is
//     set but ANTHROPIC_API_KEY is, the grader is routed to Anthropic's
//     OpenAI-compatible endpoint automatically.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { appendFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(path.join(repoRoot, "scripts", "evals.config.json"), "utf8"),
);
const workspaceBase = path.join(repoRoot, "eval-workspace");
const stageBase = path.join(workspaceBase, "ase");

function parseArgs(argv) {
  const args = {
    skills: [],
    evalIds: [],
    model: config.defaultModel,
    runs: null,
    agent: config.agent,
    dryRun: false,
    report: true,
    passthrough: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      args.passthrough = argv.slice(i + 1);
      break;
    } else if (a === "--skill") args.skills.push(argv[++i]);
    else if (a === "--eval-id") args.evalIds.push(argv[++i]);
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--runs") args.runs = argv[++i];
    else if (a === "--agent") args.agent = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-report") args.report = false;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: repoRoot, ...opts });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

function capture(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", cwd: repoRoot });
  return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function discoverSkills() {
  const skillsDir = path.join(repoRoot, "skills");
  return readdirSync(skillsDir).filter((name) =>
    existsSync(path.join(skillsDir, name, "evals", "evals.json")),
  );
}

// Builds one fixture entry into the staging dir and returns the ase-relative
// `files` entries for it. Directory fixtures with a setup.sh are built by
// running the recipe; their top-level contents (.git included) are listed
// individually so ase lands them at the harness workspace root.
function stageFixture(skill, entry, stageDir) {
  const src = path.join(repoRoot, "skills", skill, entry.replace(/\/$/, ""));
  const caseName = path.basename(src);
  const dest = path.join(stageDir, "files", caseName);
  if (!existsSync(src)) throw new Error(`fixture not found: ${src}`);

  if (statSync(src).isDirectory()) {
    const setupScript = path.join(src, "setup.sh");
    if (existsSync(setupScript)) {
      const status = run("bash", [setupScript, dest]);
      if (status !== 0) throw new Error(`setup.sh failed for ${entry}`);
    } else {
      cpSync(src, dest, { recursive: true });
    }
    return readdirSync(dest).map((name) => `files/${caseName}/${name}`);
  }

  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
  return [`files/${caseName}`];
}

function convertSuite(skill, args) {
  const canonical = JSON.parse(
    readFileSync(path.join(repoRoot, "skills", skill, "evals", "evals.json"), "utf8"),
  );
  const skillConfig = config.skills[skill] ?? {};
  const skips = skillConfig.skipEvals ?? {};
  const stageDir = path.join(stageBase, skill);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  const evals = [];
  for (const evalCase of canonical.evals) {
    const skipReason = skips[String(evalCase.id)];
    if (skipReason) {
      console.log(`  skip eval ${evalCase.id} (${evalCase.name}): ${skipReason}`);
      continue;
    }
    const files = (evalCase.files ?? []).flatMap((entry) =>
      stageFixture(skill, entry, stageDir),
    );
    evals.push({
      id: evalCase.id,
      prompt: evalCase.prompt,
      expected_output: evalCase.expected_output,
      files,
      assertions: (evalCase.assertions ?? []).map((a) =>
        typeof a === "string" ? a : a.text,
      ),
    });
  }

  const stagedSuite = path.join(stageDir, "evals.json");
  writeFileSync(
    stagedSuite,
    JSON.stringify({ skill_name: canonical.skill_name, evals }, null, 2),
  );
  return { stagedSuite, evalCount: evals.length };
}

function nextIteration(skill) {
  const skillWorkspace = path.join(workspaceBase, `${skill}-workspace`);
  if (!existsSync(skillWorkspace)) return 1;
  const iterations = readdirSync(skillWorkspace)
    .map((name) => /^iteration-(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  return iterations.length ? Math.max(...iterations) + 1 : 1;
}

function configureGraderEnv(args) {
  if (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY) return [];
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(
      "note: no OPENROUTER_API_KEY/OPENAI_API_KEY set — routing the rubric " +
        "grader to Anthropic's OpenAI-compatible endpoint.",
    );
    process.env.OPENAI_API_KEY = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_BASE_URL = "https://api.anthropic.com/v1/";
    if (!args.passthrough.includes("--grader-model")) {
      return ["--grader-model", config.graderModel];
    }
    return [];
  }
  console.warn(
    "warning: no grader API key available — LLM-rubric assertions will be " +
      "marked skipped, not failed.",
  );
  return [];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const skills = args.skills.length ? args.skills : discoverSkills();
  const failures = [];
  const summaries = [];

  for (const skill of skills) {
    console.log(`\n=== ${skill} ===`);
    const skillConfig = config.skills[skill] ?? {};
    const missingEnv = (skillConfig.requiresEnv ?? []).filter(
      (name) => !process.env[name],
    );
    if (missingEnv.length && !args.dryRun) {
      console.log(`  skipped: missing required env ${missingEnv.join(", ")}`);
      summaries.push(`- **${skill}**: skipped (missing ${missingEnv.join(", ")})`);
      continue;
    }

    const { stagedSuite, evalCount } = convertSuite(skill, args);
    if (evalCount === 0) {
      console.log("  no runnable evals after skips");
      continue;
    }

    if (run("ase", ["validate", stagedSuite]) !== 0) {
      failures.push(`${skill}: validate failed`);
      continue;
    }
    if (args.dryRun) {
      console.log(`  dry-run OK (${evalCount} evals staged and validated)`);
      summaries.push(`- **${skill}**: dry-run OK (${evalCount} evals)`);
      continue;
    }

    const runArgs = [
      "run",
      "--skill", path.join("skills", skill),
      "--evals", stagedSuite,
      "--agent", args.agent,
      "--workspace", workspaceBase,
      "--iteration", String(nextIteration(skill)),
    ];
    if (args.agent !== "fake") {
      runArgs.push("--agent-model", `${args.agent}=${args.model}`);
    }
    if (args.runs) runArgs.push("--runs", args.runs);
    for (const id of args.evalIds) runArgs.push("--eval-id", String(id));
    runArgs.push(...configureGraderEnv(args));
    runArgs.push(...args.passthrough);

    const status = run("ase", runArgs);
    if (status !== 0) failures.push(`${skill}: ase run exited ${status}`);

    if (args.report) {
      const report = capture("ase", [
        "report",
        "--workspace", path.join(workspaceBase, `${skill}-workspace`),
        "--format", "markdown",
      ]);
      console.log(report.stdout || report.stderr);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n## ${skill}\n\n${report.stdout}\n`,
        );
      }
      summaries.push(`- **${skill}**: ran ${evalCount} evals`);
    }
  }

  console.log("\n=== summary ===");
  for (const line of summaries) console.log(line);
  if (failures.length) {
    console.error(`\nfailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
}

main();
