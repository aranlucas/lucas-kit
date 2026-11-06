import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { releaseNotes } from "@/tools/release-notes.mjs";

const changes = `# CHANGES

## 1.0.2 - Second release

- Added a thing.

Some detail.

## 1.0.1

- First fix.

## 1.0.10 - Not a prefix match

- Unrelated.
`;

test("a titled entry yields its heading and body without the next release", () => {
  expect(releaseNotes(changes, "1.0.2")).toEqual({
    title: "v1.0.2 - Second release",
    body: "- Added a thing.\n\nSome detail.",
  });
});

test("an untitled entry is named by its version alone", () => {
  expect(releaseNotes(changes, "1.0.1")).toEqual({ title: "v1.0.1", body: "- First fix." });
});

test("a missing entry fails rather than publishing empty notes", () => {
  expect(() => releaseNotes(changes, "1.0.3")).toThrow('CHANGES.md has no "## 1.0.3" entry');
});

test.each([
  { heading: "## 1.0.2", title: "v1.0.2" },
  { heading: "## 1.0.2 - Final release", title: "v1.0.2 - Final release" },
])("a final heading without a newline yields empty notes: $heading", ({ heading, title }) => {
  expect(releaseNotes(heading, "1.0.2")).toEqual({ title, body: "" });
});

test("the current VERSION has notes", () => {
  /** @param {string} path */
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  expect(releaseNotes(read("CHANGES.md"), read("VERSION").trim()).body).not.toBe("");
});

// Release bodies are raw Markdown: examples are content, never release boundaries.
test.each(["```markdown", "~~~~markdown"])("preserves headings inside %s examples", (fence) => {
  const close = fence.startsWith("`") ? "```" : "~~~~";
  const body = `Before.\n\n${fence}\n## 9.9.9 - Example\n${close}\n\nAfter.`;
  expect(releaseNotes(`## 1.0.2 - Real\n\n${body}\n\n## 1.0.1\nOld.`, "1.0.2"))
    .toEqual({ title: "v1.0.2 - Real", body });
});

test("a fenced release heading cannot supply a missing release", () => {
  expect(() => releaseNotes("```md\n## 9.9.9 - Example\n```\n\n## 1.0.2\nReal.", "9.9.9"))
    .toThrow('CHANGES.md has no "## 9.9.9" entry');
});

test("a fenced duplicate before the actual release cannot replace its notes", () => {
  expect(releaseNotes("```md\n## 1.0.2 - Example\n```\n\n## 1.0.2 - Real\nActual notes.", "1.0.2"))
    .toEqual({ title: "v1.0.2 - Real", body: "Actual notes." });
});

test("CRLF headings preserve exact release identity", () => {
  expect(releaseNotes("## 1.0.2\r\n\r\nNotes.\r\n\r\n## 1.0.1\r\nOld.", "1.0.2"))
    .toEqual({ title: "v1.0.2", body: "Notes." });
});
