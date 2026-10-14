import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  markdownFiles,
  pathIsInside,
  validateProsePaths,
  validateSkillsTree,
  walk,
} from "../tools/validate-skills.mjs";

const validator = fileURLToPath(new URL("../tools/validate-skills.mjs", import.meta.url));

/** @param {(parent: string, root: string) => void} run */
function withTree(run) {
  const parent = mkdtempSync(join(tmpdir(), "pstack-validator-"));
  const root = join(parent, "skills");
  mkdirSync(root);

  try {
    run(parent, root);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

/**
 * @param {string} root
 * @param {readonly (readonly [string, string])[]} entries
 */
function writeTree(root, entries) {
  for (const [name, text] of entries) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** @param {readonly string[]} args */
function cli(args) {
  return spawnSync(process.execPath, [validator, ...args], { encoding: "utf8" });
}

/**
 * @param {string} parent
 * @param {string} root
 * @param {string} expression
 */
function cliWithThrownValue(parent, root, expression) {
  const preload = join(parent, "throw-from-fs.mjs");
  writeFileSync(
    preload,
    [
      'import fs from "node:fs";',
      'import { syncBuiltinESMExports } from "node:module";',
      "const realpath = fs.realpathSync;",
      `fs.realpathSync = (path, ...options) => { if (path === ${JSON.stringify(root)}) throw ${expression}; return realpath(path, ...options); };`,
      "syncBuiltinESMExports();",
    ].join("\n"),
  );

  return spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, validator, root], {
    encoding: "utf8",
  });
}

describe("skill filesystem traversal", () => {
  test("walk stays depth-first and sorts siblings while skipping installed and Git trees", () => {
    withTree((_, root) => {
      writeTree(root, [
        ["z.md", "# z"],
        ["a/z.md", "# a/z"],
        ["a/b/a.md", "# a/b/a"],
        ["a/a.txt", "text"],
        [".git/bad.md", "[bad](missing)"],
        ["a/node_modules/dependency/bad.md", "[bad](missing)"],
        ["node_modules/bad.md", "[bad](missing)"],
      ]);
      expect(walk(root).map((path) => relative(root, path))).toEqual([
        join("a", "a.txt"),
        join("a", "b", "a.md"),
        join("a", "z.md"),
        "z.md",
      ]);
      expect(markdownFiles(root).map((path) => relative(root, path))).toEqual([
        join("a", "b", "a.md"),
        join("a", "z.md"),
        "z.md",
      ]);
      expect(() => validateSkillsTree(root)).not.toThrow();
    });
  });

  test("walk reports directory symlinks without following them", () => {
    withTree((parent, root) => {
      writeTree(parent, [["outside/bad.md", "[bad](missing)"]]);
      symlinkSync(join(parent, "outside"), join(root, "linked-directory"), "dir");
      expect(walk(root)).toEqual([join(root, "linked-directory")]);
      expect(markdownFiles(root)).toEqual([]);
      expect(() => validateSkillsTree(root)).not.toThrow();
    });
  });

  test("path boundaries include the root and descendants but exclude sibling prefixes", () => {
    withTree((parent, root) => {
      expect(pathIsInside(root, root)).toBe(true);
      expect(pathIsInside(root, join(root, "nested", "file.md"))).toBe(true);
      expect(pathIsInside(root, parent)).toBe(false);
      expect(pathIsInside(root, join(parent, "skills-extra", "file.md"))).toBe(false);
      expect(pathIsInside(root, join(root, "..", "outside.md"))).toBe(false);
    });
  });
});

describe("local Markdown destinations", () => {
  test("angle brackets, escaped spaces, titles, encoded names, queries and fragments resolve locally", () => {
    withTree((_, root) => {
      writeTree(root, [
        ["guide with spaces.md", "# Guide"],
        ["café.md", "# Café"],
        [
          "SKILL.md",
          [
            '[angle](<guide with spaces.md> "title")',
            String.raw`[escaped](guide\ with\ spaces.md "title")`,
            "[encoded](caf%C3%A9.md?format=raw#section)",
            "[reference][guide]",
            '[guide]: <guide with spaces.md> "reference title"',
          ].join("\n"),
        ],
      ]);
      expect(() => validateSkillsTree(root)).not.toThrow();
    });
  });

  test("empty, fragment-only, protocol-relative and remote targets are ignored", () => {
    withTree((_, root) => {
      writeTree(root, [
        [
          "SKILL.md",
          [
            "[empty]()",
            "[blank](   )",
            "[empty angle](<>)",
            "[fragment](#section)",
            "[query](?format=raw)",
            "[protocol relative](//example.com/%broken)",
            "[https](HTTPS://example.com/%broken)",
            "[email](mailto:user@example.com)",
            "[custom scheme](example+docs:missing)",
            "[^note]: explanatory footnote text is not a destination",
          ].join("\n"),
        ],
      ]);
      expect(() => validateSkillsTree(root)).not.toThrow();
    });
  });

  test("malformed destinations retain their exact diagnostic text", () => {
    withTree((_, root) => {
      writeTree(root, [
        [
          "SKILL.md",
          [
            "[bad encoding](bad%ZZ.md)",
            "[invalid UTF-8](%E0%A4%A.md)",
            "[unclosed angle](<missing.md)",
            String.raw`[trailing escape](missing\)`,
          ].join("\n"),
        ],
      ]);
      expect(() => validateSkillsTree(root)).toThrow(
        new Error(
          [
            "invalid local markdown links:",
            "SKILL.md -> bad%ZZ.md (invalid URI encoding)",
            "SKILL.md -> %E0%A4%A.md (invalid URI encoding)",
            "SKILL.md -> <missing.md (missing)",
            String.raw`SKILL.md -> missing\ (missing)`,
          ].join("\n"),
        ),
      );
    });
  });

  test("problems follow sorted files and inline-before-reference collection order", () => {
    withTree((_, root) => {
      writeTree(root, [
        ["z.md", "[last](z-missing.md)"],
        [
          "a.md",
          [
            "[first-reference]: reference-missing.md",
            "[inline](inline-missing.md)",
            "[bad encoding](bad%ZZ.md)",
            "[last-reference]: final-missing.md",
          ].join("\n"),
        ],
      ]);
      expect(() => validateSkillsTree(root)).toThrow(
        new Error(
          [
            "invalid local markdown links:",
            "a.md -> inline-missing.md (missing)",
            "a.md -> bad%ZZ.md (invalid URI encoding)",
            "a.md -> reference-missing.md (missing)",
            "a.md -> final-missing.md (missing)",
            "z.md -> z-missing.md (missing)",
          ].join("\n"),
        ),
      );
    });
  });

  test("escaping and file-scheme destinations fail before missing-path checks", () => {
    withTree((parent, root) => {
      const absolute = join(parent, "missing.md");
      writeTree(root, [
        [
          "SKILL.md",
          [
            "[parent](../missing.md)",
            "[encoded parent](%2E%2E%2Fmissing.md)",
            `[absolute](${absolute})`,
            "[file](FILE:missing.md)",
          ].join("\n"),
        ],
      ]);
      expect(() => validateSkillsTree(root)).toThrow(
        new Error(
          [
            "invalid local markdown links:",
            "SKILL.md -> ../missing.md (escapes skills tree)",
            "SKILL.md -> %2E%2E%2Fmissing.md (escapes skills tree)",
            `SKILL.md -> ${absolute} (escapes skills tree)`,
            "SKILL.md -> FILE:missing.md (escapes skills tree)",
          ].join("\n"),
        ),
      );
    });
  });

  test("a symlinked root and links to files inside its real root are accepted", () => {
    withTree((parent, root) => {
      writeTree(root, [
        ["guide.md", "# Guide"],
        ["SKILL.md", "[guide](linked-guide)"],
      ]);
      symlinkSync(join(root, "guide.md"), join(root, "linked-guide"));
      const alias = join(parent, "alias");
      symlinkSync(root, alias, "dir");
      expect(() => validateSkillsTree(alias)).not.toThrow();
    });
  });

  test("directory symlink escapes and dangling links remain distinct failures", () => {
    withTree((parent, root) => {
      writeTree(parent, [["outside/guide.md", "# Outside"]]);
      symlinkSync(join(parent, "outside"), join(root, "linked-directory"), "dir");
      symlinkSync(join(parent, "missing.md"), join(root, "dangling"));
      writeTree(root, [["SKILL.md", "[outside](linked-directory/guide.md)\n[broken](dangling)"]]);
      expect(() => validateSkillsTree(root)).toThrow(
        new Error(
          [
            "invalid local markdown links:",
            "SKILL.md -> linked-directory/guide.md (escapes skills tree through symlink)",
            "SKILL.md -> dangling (missing)",
          ].join("\n"),
        ),
      );
    });
  });

  test("the first sorted filesystem read failure wins", () => {
    withTree((_, root) => {
      symlinkSync(join(root, "missing"), join(root, "a.md"));
      symlinkSync(root, join(root, "z.md"), "dir");
      expect(() => validateSkillsTree(root)).toThrow(/ENOENT.*a\.md/);
      expect(() => validateProsePaths(root)).toThrow(/ENOENT.*a\.md/);
    });
  });

  test("filesystem read failures still precede reporting accumulated link problems", () => {
    withTree((_, root) => {
      writeTree(root, [["a.md", "[missing](missing.md)"]]);
      symlinkSync(root, join(root, "z.md"), "dir");
      expect(() => validateSkillsTree(root)).toThrow(/EISDIR/);
      expect(() => validateProsePaths(root)).toThrow(/EISDIR/);
    });
  });
});

describe("prose path diagnostics", () => {
  test("the file-relative outside candidate wins over a second plugin-relative candidate", () => {
    withTree((parent) => {
      const root = join(parent, "plugin", "skills");
      writeTree(parent, [
        ["plugin/agents/outside.md", "# File-relative target"],
        ["agents/outside.md", "# Plugin-relative target"],
        ["plugin/skills/SKILL.md", "Read `../agents/outside.md`."],
      ]);
      expect(() => validateProsePaths(root)).toThrow(
        new Error(
          [
            "prose names paths outside the skills tree:",
            "SKILL.md -> ../agents/outside.md (agents/outside.md is not installed with the skills tree)",
          ].join("\n"),
        ),
      );
    });
  });

  test("sorted files preserve token order and report the first outside candidate", () => {
    withTree((parent, root) => {
      writeTree(parent, [
        ["agents/first.md", "# First"],
        ["agents/last.md", "# Last"],
      ]);
      writeTree(root, [
        ["z.md", "Read `agents/last.md`."],
        ["a.md", "Read `../agents/first.md`, then `agents/last.md`."],
      ]);
      expect(() => validateProsePaths(root)).toThrow(
        new Error(
          [
            "prose names paths outside the skills tree:",
            "a.md -> ../agents/first.md (agents/first.md is not installed with the skills tree)",
            "a.md -> agents/last.md (agents/last.md is not installed with the skills tree)",
            "z.md -> agents/last.md (agents/last.md is not installed with the skills tree)",
          ].join("\n"),
        ),
      );
    });
  });
});

describe("validator command line", () => {
  test.each([
    { name: "Error", expression: 'new Error("fixture error")', message: "fixture error" },
    { name: "plain message", expression: '({ message: "plain" })', message: "plain" },
    {
      name: "inherited message",
      expression: 'Object.create({ message: "inherited" })',
      message: "inherited",
    },
    { name: "numeric message", expression: "({ message: 42 })", message: "42" },
    { name: "primitive throw", expression: '"raw throw"', message: "undefined" },
    {
      name: "string-hint coercion",
      expression: "({ message: { [Symbol.toPrimitive](hint) { return hint; } } })",
      message: "string",
    },
  ])("retains native message access for $name", ({ expression, message }) => {
    withTree((parent, root) => {
      const result = cliWithThrownValue(parent, root, expression);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`FAIL: ${message}\n`);
    });
  });

  test.each([
    {
      name: "null throw",
      expression: "null",
      diagnostic: "TypeError: Cannot read properties of null (reading 'message')",
    },
    {
      name: "undefined throw",
      expression: "undefined",
      diagnostic: "TypeError: Cannot read properties of undefined (reading 'message')",
    },
    {
      name: "Symbol message",
      expression: '({ message: Symbol("fixture") })',
      diagnostic: "TypeError: Cannot convert a Symbol value to a string",
    },
  ])("retains the native failure for $name", ({ expression, diagnostic }) => {
    withTree((parent, root) => {
      const result = cliWithThrownValue(parent, root, expression);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(diagnostic);
      expect(result.stderr).not.toMatch(/^FAIL:/m);
    });
  });

  test("missing arguments report usage and exit 2", () => {
    const result = cli([]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("usage: node tools/validate-skills.mjs <skills-directory>\n");
  });

  test("success prints link validation before prose validation", () => {
    withTree((_, root) => {
      writeTree(root, [["SKILL.md", "# Skill"]]);
      const result = cli([root]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(
        `ok: local markdown links stay inside ${root}\nok: no prose in ${root} points at a path outside it\n`,
      );
    });
  });

  test("link failure stops before prose validation or success output", () => {
    withTree((parent, root) => {
      writeTree(parent, [["agents/outside.md", "# Outside"]]);
      writeTree(root, [["SKILL.md", "[missing](missing.md)\nRead `agents/outside.md`."]]);
      const result = cli([root]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "FAIL: invalid local markdown links:\nSKILL.md -> missing.md (missing)\n",
      );
    });
  });

  test("prose failure retains the preceding link success output", () => {
    withTree((parent, root) => {
      writeTree(parent, [["agents/outside.md", "# Outside"]]);
      writeTree(root, [["SKILL.md", "Read `agents/outside.md`."]]);
      const result = cli([root]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(`ok: local markdown links stay inside ${root}\n`);
      expect(result.stderr).toBe(
        "FAIL: prose names paths outside the skills tree:\nSKILL.md -> agents/outside.md (agents/outside.md is not installed with the skills tree)\n",
      );
    });
  });
});
