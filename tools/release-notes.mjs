#!/usr/bin/env node
// Read one release's title and notes from CHANGES.md for the GitHub release.
// The generator already requires a `## <version> - <title>` heading per
// release, so a missing entry here means the release job ran on a bad tree.
import { readFileSync, writeFileSync } from "node:fs";
import { fromMarkdown } from "mdast-util-from-markdown";

/**
 * Read one exact release section, excluding subsequent releases.
 * @param {string} changes
 * @param {string} version
 * @returns {{ title: string, body: string }} Release heading and trimmed notes.
 * @throws {Error} When the requested release has no heading.
 */
export function releaseNotes(changes, version) {
  const headings = fromMarkdown(changes).children.filter(
    (node) => node.type === "heading" && node.depth === 2,
  );
  const index = headings.findIndex((node) => {
    const line = changes.slice(node.position.start.offset, node.position.end.offset);
    const heading = line.replace(/^## /, "");
    return heading === version || heading.startsWith(`${version} - `);
  });
  if (index === -1) throw new Error(`CHANGES.md has no "## ${version}" entry`);
  const node = headings[index];
  const heading = changes.slice(node.position.start.offset + 3, node.position.end.offset).trim();
  const body = changes
    .slice(node.position.end.offset, headings[index + 1]?.position.start.offset)
    .trim();
  const title = heading === version ? `v${version}` : `v${heading}`;
  return { title, body };
}

if (import.meta.main) {
  const [version, output] = process.argv.slice(2);
  if (!version || !output || process.argv.length > 4) {
    console.error("usage: node tools/release-notes.mjs <version> <notes-file>");
    process.exitCode = 2;
  } else {
    const { title, body } = releaseNotes(
      readFileSync(new URL("../CHANGES.md", import.meta.url), "utf8"),
      version,
    );
    writeFileSync(output, `${body}\n`);
    console.log(title);
  }
}
