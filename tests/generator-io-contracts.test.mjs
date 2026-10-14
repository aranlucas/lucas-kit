import { afterEach, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  apply,
  changes,
  loadModels,
  problems,
  regions,
  validateHooks,
} from "../tools/generate.mjs";
import { RUNTIMES } from "../tools/runtimes.mjs";

/** @type {string[]} */
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** @param {Readonly<Record<string, string>>} files */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "generator-io-contracts-"));
  fixtures.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test("read-only plans retain write order, sorted removals and logging after each operation", () => {
  const root = tree({ "out/current.md": "same", "out/z-old.md": "Z", "out/a-old.md": "A" });
  const intended = Object.freeze({
    files: Object.freeze({ "out/b.md": "B", "out/a.md": "A", "out/current.md": "same" }),
    ownedDirs: Object.freeze(["out"]),
  });
  const expected = [
    { kind: "write", path: "out/b.md" },
    { kind: "write", path: "out/a.md" },
    { kind: "remove", path: "out/a-old.md" },
    { kind: "remove", path: "out/z-old.md" },
  ];
  expect(changes(root, intended)).toEqual(expected);
  /** @type {string[]} */
  const logged = [];
  const pending = apply(root, intended, {
    log: (message) => {
      logged.push(message);
      expect(readFileSync(join(root, "out/b.md"), "utf8")).toBe("B");
      expect(existsSync(join(root, "out/a.md"))).toBe(logged.length >= 2);
      expect(existsSync(join(root, "out/a-old.md"))).toBe(logged.length < 3);
      expect(existsSync(join(root, "out/z-old.md"))).toBe(logged.length < 4);
    },
  });
  expect(pending).toEqual(expected);
  expect(pending.map((change) => Object.keys(change))).toEqual(
    expected.map(() => ["kind", "path"]),
  );
  expect(logged).toEqual(expected.map(({ kind, path }) => `${kind}: ${path}`));
  expect(changes(root, intended)).toEqual([]);
});

test("a log callback failure escapes unchanged after its write and before later operations", () => {
  const root = tree({ "out/orphan.md": "keep until removal" });
  const intended = {
    files: { "out/first.md": "first", "out/later.md": "later" },
    ownedDirs: ["out"],
  };
  const failure = new Error("logging stopped");
  /** @type {string[]} */
  const logged = [];
  /** @type {unknown} */
  let thrown;
  try {
    apply(root, intended, {
      log: (message) => {
        logged.push(message);
        throw failure;
      },
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(failure);
  expect(logged).toEqual(["write: out/first.md"]);
  expect(readFileSync(join(root, "out/first.md"), "utf8")).toBe("first");
  expect(existsSync(join(root, "out/later.md"))).toBe(false);
  expect(readFileSync(join(root, "out/orphan.md"), "utf8")).toBe("keep until removal");
});

test("preflight failures produce no earlier writes or callback messages", () => {
  const root = tree({ "out/blocked/inside.md": "directory contents" });
  const intended = {
    files: { "out/first.md": "first", "out/blocked": "replacement" },
    ownedDirs: ["out"],
  };
  /** @type {string[]} */
  const logged = [];
  expect(() => apply(root, intended, { log: (message) => logged.push(message) })).toThrow(
    "out/blocked is not a regular file; the generator never overwrites one",
  );
  expect(logged).toEqual([]);
  expect(existsSync(join(root, "out/first.md"))).toBe(false);
  expect(readFileSync(join(root, "out/blocked/inside.md"), "utf8")).toBe("directory contents");
});

test.each([undefined, null, 23, { detail: "retained" }])(
  "validation failures retain their raw message value %j",
  (message) => {
    const runtime = RUNTIMES[0];
    const validate = runtime.validate;
    const failure = new Error("replaced message");
    Object.defineProperty(failure, "message", { value: message });
    runtime.validate = () => {
      throw failure;
    };
    try {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const failures = problems(root, loadModels(root));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toBe(message);
    } finally {
      runtime.validate = validate;
    }
  },
);

test("region ordering keeps role grouping and defers model reads until rendering", () => {
  /** @type {string[]} */
  const reads = [];
  /** @param {string} role @param {string} skill */
  const entry = (role, skill) => ({
    role,
    skill,
    get models() {
      reads.push(role);
      return ["opus"];
    },
  });
  const first = entry("first zeta", "zeta");
  const models = {
    ...loadModels(),
    roles: [
      first,
      entry("interrogate reviewers", "interrogate"),
      entry("alpha", "alpha"),
      entry("second zeta", "zeta"),
    ],
  };
  const planned = regions(models);
  expect(reads).toEqual(["interrogate reviewers"]);
  expect(planned.slice(0, 6).map(({ file, name }) => [file, name])).toEqual([
    ["plugins/pstack/skills/zeta/SKILL.md", "Models section"],
    ["plugins/pstack/skills/alpha/SKILL.md", "Models section"],
    ["plugins/pstack/skills/interrogate/SKILL.md", "reviewer table"],
    ["plugins/pstack/skills/zeta/SKILL.md", "Reasoning effort section"],
    ["plugins/pstack/skills/interrogate/SKILL.md", "Reasoning effort section"],
    ["plugins/pstack/skills/alpha/SKILL.md", "Reasoning effort section"],
  ]);
  expect(Object.keys(planned[0])).toEqual(["file", "name", "locate", "appendHeading", "render"]);
  expect(Object.keys(planned[2])).toEqual(["file", "name", "locate", "render"]);
  first.role = "updated zeta";
  expect(planned[0].render().join("\n")).toContain("- updated zeta: `opus`\n- second zeta: `opus`");
  expect(reads).toEqual(["interrogate reviewers", "first zeta", "second zeta"]);
});

test("schema diagnostics group unknown keys once before later faults and path checks", () => {
  /** @type {string[]} */
  const inspected = [];
  const hooks = JSON.stringify({
    hooks: {
      Start: [
        {
          hooks: [
            {
              type: "command",
              command: "${CLAUDE_PLUGIN_ROOT}/never",
              extraA: true,
              extraB: 0,
              timeout: "wrong",
            },
            { type: "command", command: "${CLAUDE_PLUGIN_ROOT}/later" },
          ],
        },
      ],
    },
  });
  expect(() =>
    validateHooks(hooks, {
      statOf: (path) => {
        inspected.push(path);
        return null;
      },
    }),
  ).toThrow(
    new Error(
      "hooks/hooks.json:\n  Start: unknown key extraA, extraB\n  Start: timeout must be number\n  Start: later does not exist in the plugin",
    ),
  );
  expect(inspected).toEqual(["later"]);
});
