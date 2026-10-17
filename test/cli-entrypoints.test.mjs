import { afterEach, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
/** @type {string[]} */
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test.each([
  { file: "generate.mjs", args: ["--unexpected"], status: 1 },
  { file: "sync.mjs", args: [], status: 2 },
  { file: "validate-skills.mjs", args: [], status: 2 },
  { file: "release-notes.mjs", args: [], status: 2 },
  { file: "pack-skills.mjs", args: ["one", "two"], status: 2 },
])("$file executes its CLI through a symbolic link", ({ file, args, status }) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "kit-cli-link-")));
  directories.push(directory);
  const link = join(directory, file);
  symlinkSync(join(repo, "tools", file), link, "file");

  const result = spawnSync(process.execPath, [link, ...args], { encoding: "utf8" });

  expect(result.status).toBe(status);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(`usage: node tools/${file}`);
});
