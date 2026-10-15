#!/usr/bin/env node
// Read one release's title and notes from CHANGES.md for the GitHub release.
// The generator already requires a `## <version> - <title>` heading per
// release, so a missing entry here means the release job ran on a bad tree.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @param {string} changes
 * @param {string} version
 */
export function releaseNotes(changes, version) {
  const sections = changes.split(/^(?=## )/m);
  const section = sections.find((text) => {
    const heading = text.slice(3, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
    return heading === version || heading.startsWith(`${version} - `);
  });
  if (!section) throw new Error(`CHANGES.md has no "## ${version}" entry`);
  const newline = section.indexOf("\n");
  const heading = section.slice(3, newline === -1 ? undefined : newline).trim();
  const body = newline === -1 ? "" : section.slice(newline + 1).trim();
  const title = heading === version ? `v${version}` : `v${heading}`;
  return { title, body };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, output] = process.argv.slice(2);
  if (!version || !output || process.argv.length > 4) {
    console.error("usage: node tools/release-notes.mjs <version> <notes-file>");
    process.exitCode = 2;
  } else {
    const { title, body } = releaseNotes(readFileSync(new URL("../CHANGES.md", import.meta.url), "utf8"), version);
    writeFileSync(output, `${body}\n`);
    console.log(title);
  }
}
