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

test("the current VERSION has notes", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  expect(releaseNotes(read("CHANGES.md"), read("VERSION").trim()).body).not.toBe("");
});
