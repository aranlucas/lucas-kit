import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflowFiles = ["ci.yml", "security.yml"];
const workflows = workflowFiles.map((file) => {
  const source = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
  return { source, configuration: parse(source) };
});

test("the vulnerability job exposes every document from both lockfiles", async () => {
  const { mkdtemp, mkdir, writeFile, readdir, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "kit-lockfiles-"));
  try {
    const nested = join(directory, "plugins/pstack/skills/poteto-mode/scripts");
    const temporary = join(directory, "temporary");
    await mkdir(nested, { recursive: true });
    await mkdir(temporary);
    await writeFile(join(directory, "pnpm-lock.yaml"), "root-manager\n---\nroot-project\n");
    await writeFile(join(nested, "pnpm-lock.yaml"), "script-manager\n---\nscript-project\n");
    const run = workflows[1].configuration.jobs["osv-scan"].steps.find(
      ({ name }) => name === "Scan lockfiles",
    ).run;
    const python = run.match(/python3 - <<'PY'\n([\s\S]*?)\nPY\n/);
    expect(python).not.toBeNull();
    const result = spawnSync("python3", ["-c", python[1]], {
      cwd: directory,
      env: { ...process.env, RUNNER_TEMP: temporary },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const output = join(temporary, "osv-pnpm");
    const folders = await readdir(output);
    const documents = await Promise.all(
      folders.map((folder) => readFile(join(output, folder, "pnpm-lock.yaml"), "utf8")),
    );
    expect(documents.map((document) => document.trim()).sort()).toEqual([
      "root-manager",
      "root-project",
      "script-manager",
      "script-project",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
