import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { lastChats } from "../plugins/pstack/skills/poteto-mode/scripts/worktree-audit.mjs";

/** @type {string[]} */
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function transcriptRoot() {
  const root = mkdtempSync(join(tmpdir(), "worktree-matcher-contract-"));
  roots.push(root);

  return root;
}

/** @param {string} path @param {string} cwd */
function matches(path, cwd) {
  const root = transcriptRoot();
  writeFileSync(join(root, "session.jsonl"), `${JSON.stringify({ cwd })}\n`);

  return lastChats([root], new Map([[path, [path]]])).has(path);
}

test.each([
  ["multibyte path followed by a boundary", "/repo/café/猫", "cd /repo/café/猫;ls"],
  ["JSON line separator in a path", "/repo/line\u2028tree", "/repo/line\u2028tree/file"],
  ["JSON paragraph separator in a path", "/repo/line\u2029tree", "/repo/line\u2029tree/file"],
  ["POSIX backslash in a path", String.raw`/repo/with\slash`, String.raw`/repo/with\slash/file`],
])("matches a %s without changing its bytes", (_, path, cwd) => {
  expect(matches(path, cwd)).toBe(true);
});

test.each([
  ["/repo/worktree", "/repo/worktreeé"],
  ["/repo/café", "/repo/café猫"],
  ["/repo/café", "/repo/cafe\u0301"],
  ["/repo/café", "/repo/café.bak"],
])("does not normalize or truncate %s to match %s", (path, cwd) => {
  expect(matches(path, cwd)).toBe(false);
});

test("keeps first-match insertion order while later roots update timestamps", () => {
  const early = transcriptRoot();
  const late = transcriptRoot();
  const earlyFile = join(early, "session.jsonl");
  const lateFile = join(late, "session.jsonl");
  writeFileSync(earlyFile, `${JSON.stringify({ cwd: "/wt/a", command: "cd /wt/b" })}\n`);
  writeFileSync(lateFile, `${JSON.stringify({ cwd: "/wt/a" })}\n`);
  utimesSync(earlyFile, 100, 100);
  utimesSync(lateFile, 200, 200);

  const spellings = new Map([
    ["/wt/b", ["/wt/b"]],
    ["/wt/a", ["/wt/a"]],
    ["/wt/missing", ["/wt/missing"]],
  ]);

  const before = [...spellings].map(([path, forms]) => [path, [...forms]]);

  expect([...lastChats([early, late], spellings)]).toEqual([
    ["/wt/b", 100],
    ["/wt/a", 200],
  ]);
  expect([...spellings]).toEqual(before);
});

test("a matching transcript at the zero timestamp does not become a latest chat", () => {
  const root = transcriptRoot();
  const file = join(root, "session.jsonl");
  writeFileSync(file, `${JSON.stringify({ cwd: "/wt/a" })}\n`);
  utimesSync(file, 0, 0);

  expect([...lastChats([root], new Map([["/wt/a", ["/wt/a"]]]))]).toEqual([]);
});
