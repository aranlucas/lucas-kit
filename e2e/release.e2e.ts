import { test as base, expect } from "e2e";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const test = base.extend<{ checkout: string }>({
  checkout: async ({}, use) => {
    const path = mkdtempSync(join(tmpdir(), "kit-release-e2e-"));
    try {
      cpSync(join(repo, "tools"), join(path, "tools"), { recursive: true });
      symlinkSync(join(repo, "node_modules"), join(path, "node_modules"), "dir");
      await use(path);
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  },
});

function release(checkout: string, version: string) {
  return spawnSync(process.execPath, ["tools/release-notes.mjs", version, "notes.md"], {
    cwd: checkout,
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("release CLI preserves fenced examples and refuses a version only in code", async ({ checkout }) => {
  const body = "- Real fix.\n\n```markdown\n## 9.9.9 - Example only\n```\n\n- Full notes.";
  writeFileSync(join(checkout, "CHANGES.md"), `# Changes\n\n## 1.0.2 - Correct release\n\n${body}\n\n## 1.0.1 - Earlier\n\nOld.\n`);

  const success = release(checkout, "1.0.2");
  expect(success.error).toBeUndefined();
  expect(success.status).toBe(0);
  expect(success.stderr).toBe("");
  expect(success.stdout).toBe("v1.0.2 - Correct release\n");
  expect(readFileSync(join(checkout, "notes.md"), "utf8")).toBe(`${body}\n`);

  const missing = release(checkout, "9.9.9");
  expect(missing.error).toBeUndefined();
  expect(missing.status).toBe(1);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain('CHANGES.md has no "## 9.9.9" entry');
  expect(readFileSync(join(checkout, "notes.md"), "utf8")).toBe(`${body}\n`);
});
