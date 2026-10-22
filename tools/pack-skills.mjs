#!/usr/bin/env node
// Build a skills-only dependency with the root layout pnpm discovers.
// Stage outside the checkout so packaging never duplicates or edits source skills.
import { execFileSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateProsePaths, validateSkillsTree, walk } from "./validate-skills.mjs";
import { runPnpm } from "./pnpm.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const notices = ["LICENSE", "LICENSE-cursor-team-kit", "LICENSE-thermos", "NOTICE-skills.md"];

export function packSkills(root = repoRoot, destination = join(root, "dist")) {
  const source = join(root, "plugins/pstack/skills");
  validateSkillsTree(source);
  validateProsePaths(source);
  const { name, version, author, homepage, repository, license, packageManager, engines } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const output = resolve(destination);
  const staging = mkdtempSync(join(tmpdir(), "lucas-kit-skills-"));
  try {
    cpSync(source, join(staging, "skills"), {
      recursive: true,
      filter: (path) => !["node_modules", ".git", ".DS_Store"].includes(basename(path)),
    });
    for (const file of notices) cpSync(join(root, file), join(staging, file));
    // pnpm preserves executable resources only when the manifest lists them.
    const executableFiles = walk(join(staging, "skills"))
      .filter((file) => statSync(file).mode & 0o111)
      .map((file) => relative(staging, file).split("\\").join("/"));
    cpSync(join(root, "README.md"), join(staging, "README.md"));
    writeFileSync(join(staging, "package.json"), `${JSON.stringify({
      name,
      version,
      description: "Lucas Kit agent skills for pnpm projects. Requires T3 Code's MCP tools.",
      author, homepage, repository, license,
      packageManager,
      engines,
      publishConfig: { access: "public", executableFiles },
      files: ["skills", "README.md", ...notices],
    }, null, 2)}\n`);
    mkdirSync(output, { recursive: true });
    const archive = join(output, `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`);
    const packed = runPnpm(["pack", "--json", "--out", archive], {
      cwd: staging,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (packed.error) throw packed.error;
    if (packed.status !== 0) throw new Error(packed.stdout + packed.stderr);
    // pnpm pack excludes pnpm-lock.yaml at every depth, even from explicit
    // manifest files. Skill-bundled CLIs need their exact lock for a frozen
    // bootstrap. Keep pnpm's manifest/executable handling and add only those
    // source lockfiles back into the completed archive.
    const locks = walk(join(staging, "skills"))
      .filter((file) => basename(file) === "pnpm-lock.yaml")
      .map((file) => relative(staging, file));
    if (locks.length) {
      const additions = join(staging, "lockfiles");
      for (const file of locks) {
        const target = join(additions, "package", file);
        mkdirSync(join(target, ".."), { recursive: true });
        cpSync(join(staging, file), target);
      }
      const tarball = join(staging, "packed.tar");
      writeFileSync(tarball, gunzipSync(readFileSync(archive)));
      execFileSync("tar", ["-rf", tarball, "-C", additions, ...locks.map((file) => join("package", file).split("\\").join("/"))]);
      writeFileSync(archive, gzipSync(readFileSync(tarball)));
    }
    return archive;
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
