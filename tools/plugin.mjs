// Where the plugin lives in the repo, and the Markdown code spans the generator
// and the runtime table render identifiers with.

export const PLUGIN = "plugins/pstack";
export const SKILLS = `${PLUGIN}/skills`;

/** @param {string} identifier */
export const code = (identifier) => `\`${identifier}\``;
/** @param {readonly string[]} models */
export const codeList = (models) => models.map(code).join(", ");
