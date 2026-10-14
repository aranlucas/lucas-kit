import { afterEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "poteto-bootstrap-"));
  directories.push(directory);
  copyFileSync(
    join(import.meta.dirname, "bootstrap.ts"),
    join(directory, "bootstrap.ts")
  );
  writeFileSync(
    join(directory, "package.json"),
    '{"type":"module","devDependencies":{"vitest":"5.0.3"}}\n'
  );
  writeFileSync(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const pnpm = join(bin, "pnpm");
  writeFileSync(
    pnpm,
    `#!${process.execPath}
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
appendFileSync("calls.jsonl", JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.env.INSTALL_FAIL) { console.error("install fixture failed"); process.exit(7); }
if (!process.env.INSTALL_INCOMPLETE) {
  mkdirSync("node_modules/commander", { recursive: true });
  writeFileSync("node_modules/commander/package.json", '{"version":"14.0.0"}');
}
`
  );
  chmodSync(pnpm, 0o755);
  const run = (env: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { ensureDependenciesInstalled } from ${JSON.stringify(join(directory, "bootstrap.ts"))}; ensureDependenciesInstalled();`,
      ],
      { cwd: tmpdir(), encoding: "utf8", env: { PATH: bin, ...env } }
    );
  const calls = () =>
    existsSync(join(directory, "calls.jsonl"))
      ? readFileSync(join(directory, "calls.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  return { directory, run, calls };
}

it("installs frozen production dependencies in the scripts directory and caches the install", () => {
  const { directory, run, calls } = fixture();
  expect(run().status).toBe(0);
  expect(calls()).toEqual([["install", "--frozen-lockfile", "--prod"]]);
  expect(
    readFileSync(
      join(directory, "node_modules/.poteto-mode-tools-install-key"),
      "utf8"
    )
  ).toMatch(/^[a-f0-9]{64}\n$/);
  expect(run().status).toBe(0);
  expect(calls()).toHaveLength(1);
});

it.each(["package.json", "pnpm-lock.yaml"])(
  "reinstalls when %s changes",
  (file) => {
    const { directory, run, calls } = fixture();
    expect(run().status).toBe(0);
    writeFileSync(
      join(directory, file),
      readFileSync(join(directory, file), "utf8") + "\n"
    );
    expect(run().status).toBe(0);
    expect(calls()).toHaveLength(2);
  }
);

it("refreshes an existing development install without pruning its dependencies", () => {
  const { directory, run, calls } = fixture();
  mkdirSync(join(directory, "node_modules/vitest"), { recursive: true });
  writeFileSync(join(directory, "node_modules/vitest/package.json"), "{}");
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  expect(calls()).toEqual([["install", "--frozen-lockfile"]]);
  writeFileSync(
    join(directory, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\n"
  );
  expect(run().status).toBe(0);
  expect(calls()).toEqual([
    ["install", "--frozen-lockfile"],
    ["install", "--frozen-lockfile"],
  ]);
});

it("explains a missing package manager without recording a completed install", () => {
  const { directory, run } = fixture();
  const result = run({ PATH: join(directory, "missing-bin") });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Could not run pnpm. Install pnpm 12.11.0");
  expect(
    existsSync(join(directory, "node_modules/.poteto-mode-tools-install-key"))
  ).toBe(false);
});

it("propagates installation failure without caching it", () => {
  const { directory, run } = fixture();
  const result = run({ INSTALL_FAIL: "1" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("install fixture failed");
  expect(result.stderr).toContain("exited with status 7");
  expect(
    existsSync(join(directory, "node_modules/.poteto-mode-tools-install-key"))
  ).toBe(false);
});

it("rejects an installation that did not provide commander", () => {
  const { directory, run } = fixture();
  const result = run({ INSTALL_INCOMPLETE: "1" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("completed without installing commander");
  expect(
    existsSync(join(directory, "node_modules/.poteto-mode-tools-install-key"))
  ).toBe(false);
});

it("reinstalls when a cached dependency is removed", () => {
  const { directory, run, calls } = fixture();
  expect(run().status).toBe(0);
  rmSync(join(directory, "node_modules/commander"), { recursive: true });
  expect(run().status).toBe(0);
  expect(calls()).toHaveLength(2);
});
