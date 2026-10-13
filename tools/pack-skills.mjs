#!/usr/bin/env node
// Build a skills-only dependency with the root layout pnpm discovers.
// Stage outside the checkout so packaging never duplicates or edits source skills.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateProsePaths, validateSkillsTree } from "./validate-skills.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const notices = ["LICENSE", "LICENSE-cursor-team-kit", "LICENSE-thermos", "NOTICE-skills.md"];

export function packSkills(root = repoRoot, destination = join(root, "dist")) {
  const source = join(root, "plugins/pstack/skills");
  validateSkillsTree(source);
  validateProsePaths(source);
  const { name, version, author, homepage, repository, license } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const output = resolve(destination);
  const staging = mkdtempSync(join(tmpdir(), "lucas-kit-skills-"));
  try {
    cpSync(source, join(staging, "skills"), {
      recursive: true,
      filter: (path) => !["node_modules", ".git", ".DS_Store"].includes(basename(path)),
    });
    for (const file of notices) cpSync(join(root, file), join(staging, file));
    writeFileSync(join(staging, "package.json"), `${JSON.stringify({
      name: `${name}-skills`,
      version,
      private: true,
      description: "lucas-kit skills for project-local installation with pnpm. Requires T3 Code's MCP tools.",
      author, homepage, repository, license,
      files: ["skills", ...notices],
    }, null, 2)}\n`);
    mkdirSync(output, { recursive: true });
    const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], {
      cwd: staging,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
    // npm <=11 returns an array; npm 12 keys results by package name.
    const result = Array.isArray(packed) ? packed[0] : packed[`${name}-skills`];
    return join(output, result.filename);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 3) {
    console.error("usage: node tools/pack-skills.mjs [output-directory]");
    process.exitCode = 2;
  } else {
    console.log(packSkills(repoRoot, process.argv[2]));
  }
}
