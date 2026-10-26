import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
/** @type {string[]} */
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Copy the tools so relative imports still resolve with --preserve-symlinks-main.
// Every command runs against disposable data, including its failure paths.
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "kit-cli # ü-")));
  directories.push(directory);
  cpSync(join(repo, "tools"), join(directory, "tools"), { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(directory, "node_modules"), "dir");
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  return directory;
}

const tools = [
  { file: "validate-skills.mjs", args: [] },
  { file: "release-notes.mjs", args: [] },
  { file: "pack-skills.mjs", args: ["one", "two"] },
];

describe.each(tools)("$file main-module controls", ({ file, args }) => {
  test.each([
    "absolute",
    "relative",
    "file symlink",
    "directory symlink",
    "preserved main symlink",
  ])("executes through %s with encoded path characters", (mode) => {
    const directory = fixture();
    let entry = join(directory, "tools", file);
    const flags = [];
    if (mode === "relative") entry = join("tools", file);
    if (mode === "directory symlink") {
      symlinkSync(join(directory, "tools"), join(directory, "tools-alias"), "dir");
      entry = join(directory, "tools-alias", file);
    }
    if (mode === "file symlink" || mode === "preserved main symlink") {
      const link = `main # ü-${file}`;
      symlinkSync(join(directory, "tools", file), join(directory, "tools", link), "file");
      entry = join("tools", link);
      if (mode === "preserved main symlink") flags.push("--preserve-symlinks-main");
    }

    const result = spawnSync(process.execPath, [...flags, entry, ...args], {
      cwd: directory,
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`usage: node tools/${file}`);
  });

  test.each(["absent", "unrelated", "missing", "imported module"])(
    "import stays inert when argv names %s",
    (mode) => {
      const directory = fixture();
      const entry = join(directory, "tools", file);
      const paths = {
        unrelated: join(directory, "package.json"),
        missing: join(directory, "missing.mjs"),
        "imported module": entry,
      };
      const source = `
        ${mode === "absent" ? "delete process.argv[1]" : `process.argv[1] = ${JSON.stringify(paths[mode])}`};
        await import(${JSON.stringify(pathToFileURL(entry).href)});
        console.log("IMPORTED");
      `;
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
        cwd: directory,
        encoding: "utf8",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("IMPORTED\n");
      expect(result.stderr).toBe("");
    },
  );
});

describe.each([
  { file: "validate-skills.mjs", args: ["missing-skills"], diagnostic: "FAIL:" },
  { file: "release-notes.mjs", args: ["1.0.16", "notes.md"], diagnostic: "ENOENT" },
  { file: "pack-skills.mjs", args: ["dist"], diagnostic: "ENOENT" },
])("$file body failures", ({ file, args, diagnostic }) => {
  test.each([false, true])("propagates failures with preserve-symlinks-main=%s", (preserve) => {
    const directory = fixture();
    const link = join("tools", `main # ü-${file}`);
    symlinkSync(join(directory, "tools", file), join(directory, link), "file");

    const result = spawnSync(
      process.execPath,
      [...(preserve ? ["--preserve-symlinks-main"] : []), link, ...args],
      { cwd: directory, encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(diagnostic);
    expect(existsSync(join(directory, "notes.md"))).toBe(false);
    expect(existsSync(join(directory, "dist"))).toBe(false);
  });
});

test("a symlinked release CLI writes the selected notes and prints its title", () => {
  const directory = fixture();
  writeFileSync(join(directory, "CHANGES.md"), "# Changes\n\n## 1.0.16 - Example\n\n- Fixed.\n");
  const link = join(directory, "release.mjs");
  symlinkSync(join(directory, "tools/release-notes.mjs"), link, "file");

  const result = spawnSync(process.execPath, [link, "1.0.16", "notes.md"], {
    cwd: directory,
    encoding: "utf8",
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("v1.0.16 - Example\n");
  expect(result.stderr).toBe("");
  expect(readFileSync(join(directory, "notes.md"), "utf8")).toBe("- Fixed.\n");
});

test("a symlinked validation CLI validates the requested skills directory", () => {
  const directory = fixture();
  mkdirSync(join(directory, "skills"));
  writeFileSync(join(directory, "skills/SKILL.md"), "# Example\n");
  const link = join(directory, "validate.mjs");
  symlinkSync(join(directory, "tools/validate-skills.mjs"), link, "file");

  const result = spawnSync(process.execPath, [link, "skills"], {
    cwd: directory,
    encoding: "utf8",
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(
    "ok: local markdown links stay inside skills\nok: no prose in skills points at a path outside it\n",
  );
  expect(result.stderr).toBe("");
});
