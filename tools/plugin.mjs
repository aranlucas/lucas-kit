// Where the plugin lives in the repo, and the Markdown code spans the generator
// and the runtime table render identifiers with.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PLUGIN = "plugins/pstack";
export const SKILLS = `${PLUGIN}/skills`;

/** @param {string} identifier */
export const code = (identifier) => `\`${identifier}\``;
/** @param {readonly string[]} models */
export const codeList = (models) => models.map(code).join(", ");

/** @param {string} moduleUrl */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    // Node resolves the main module's symbolic links before setting import.meta.url.
    return pathToFileURL(realpathSync(process.argv[1])).href === moduleUrl;
  } catch {
    return false;
  }
}
