// Root test discovery must stay within the root suite. The separately packaged
// scripts have their own dependencies and their own CI test command.
import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));

function loadedFiles(...paths) {
  const result = spawnSync(process.execPath, [cli, "list", ...paths, "--filesOnly", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return JSON.parse(result.stdout)
    .map(({ file }) => relative(repoRoot, file).replaceAll("\\", "/"))
    .sort();
}

test("default discovery loads the same root tests as an explicit test/ filter", () => {
  const files = loadedFiles();
  expect(files.length).toBeGreaterThan(0);
  expect(files).toEqual(loadedFiles("test/"));
  expect(files.every((file) => file.startsWith("test/"))).toBe(true);
});

test("source and helper aliases resolve to their existing modules", async () => {
  expect(await import("@/tools/model-policy.mjs")).toBe(await import("../tools/model-policy.mjs"));
  expect(await import("@test/session-hook-sheets.mjs")).toBe(
    await import("./session-hook-sheets.mjs"),
  );
});
