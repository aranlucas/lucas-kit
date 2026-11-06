export const PLUGIN = "plugins/pstack";
export const SKILLS = `${PLUGIN}/skills`;

// The portable tree calls its skills-only notice NOTICE.md; the package keeps
// the repository filename to distinguish it from the full plugin notice.
export const SKILL_NOTICES = {
  LICENSE: "LICENSE",
  "LICENSE-cursor-team-kit": "LICENSE-cursor-team-kit",
  "LICENSE-thermos": "LICENSE-thermos",
  "NOTICE-skills.md": "NOTICE.md",
};

/** @param {string} identifier */
export const code = (identifier) => `\`${identifier}\``;
/** @param {readonly string[]} models */
export const codeList = (models) => models.map(code).join(", ");
