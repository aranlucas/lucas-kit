import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
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
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const tools = [
  { file: "generate.mjs", args: ["--unexpected"], status: 1 },
  { file: "sync.mjs", args: [], status: 2 },
  { file: "validate-skills.mjs", args: [], status: 2 },
  { file: "release-notes.mjs", args: [], status: 2 },
  { file: "pack-skills.mjs", args: ["one", "two"], status: 2 },
];

test.each(tools)("$file executes its CLI through a symbolic link", ({ file, args, status }) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "kit-cli-link-")));
  directories.push(directory);
  const link = join(directory, file);
  symlinkSync(join(repo, "tools", file), link, "file");

  const result = spawnSync(process.execPath, [link, ...args], { encoding: "utf8" });

  expect(result.status).toBe(status);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(`usage: node tools/${file}`);
});

// Copy the tools and their shipped parser: relative imports must resolve when Node
// preserves a same-directory main symlink. Keep fixture mutations off the checkout.
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "kit-cli # ü-")));
  directories.push(directory);
  cpSync(join(repo, "tools"), join(directory, "tools"), { recursive: true });
  const scripts = "plugins/pstack/skills/setup-pstack/scripts";
  mkdirSync(join(directory, scripts), { recursive: true });
  cpSync(join(repo, scripts, "t3-sheet.mjs"), join(directory, scripts, "t3-sheet.mjs"));
  symlinkSync(join(repo, "node_modules"), join(directory, "node_modules"), "dir");
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  return directory;
}

describe.each(tools)("$file main-module controls", ({ file, args, status }) => {
  test.each(["absolute", "relative", "directory symlink", "preserved main symlink"])(
    "executes through %s with encoded path characters",
    (mode) => {
      const directory = fixture();
      let entry = join(directory, "tools", file);
      const flags = [];
      if (mode === "relative") entry = join("tools", file);
      if (mode === "directory symlink") {
        symlinkSync(join(directory, "tools"), join(directory, "tools-alias"), "dir");
        entry = join(directory, "tools-alias", file);
      }
      if (mode === "preserved main symlink") {
        const link = `main # ü-${file}`;
        symlinkSync(join(directory, "tools", file), join(directory, "tools", link), "file");
        entry = join("tools", link);
        flags.push("--preserve-symlinks-main");
      }

      const result = spawnSync(process.execPath, [...flags, entry, ...args], {
        cwd: directory,
        encoding: "utf8",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`usage: node tools/${file}`);
    },
  );

  test.each(["absent", "unrelated", "missing"])("import stays inert with %s argv", (mode) => {
    const directory = fixture();
    const argv =
      mode === "unrelated" ? join(directory, "package.json") : join(directory, "missing.mjs");
    const source = `
      ${mode === "absent" ? "delete process.argv[1]" : `process.argv[1] = ${JSON.stringify(argv)}`};
      await import(${JSON.stringify(pathToFileURL(join(directory, "tools", file)).href)});
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
  });
});

test.each([
  { file: "generate.mjs", args: ["--check"], diagnostic: "FAIL:" },
  { file: "sync.mjs", args: [], diagnostic: "SyntaxError" },
  { file: "validate-skills.mjs", args: ["missing-skills"], diagnostic: "FAIL:" },
  { file: "release-notes.mjs", args: ["1.0.16", "notes.md"], diagnostic: "ENOENT" },
  { file: "pack-skills.mjs", args: ["dist"], diagnostic: "ENOENT" },
])(
  "$file preserves CLI body failures through a preserved main symlink",
  ({ file, args, diagnostic }) => {
    const directory = fixture();
    writeFileSync(join(directory, "tools", "upstream.json"), "{invalid json");
    const link = join("tools", `main # ü-${file}`);
    symlinkSync(join(directory, "tools", file), join(directory, link), "file");

    const result = spawnSync(process.execPath, ["--preserve-symlinks-main", link, ...args], {
      cwd: directory,
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(diagnostic);
  },
);
