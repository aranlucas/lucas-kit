import { expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkPlaybooks } from "../plugins/pstack/skills/poteto-mode/scripts/check-playbooks.mjs";

/**
 * @param {Record<string, string>} files
 * @param {string} baseText
 * @param {(root: string, bundled: string) => void} check
 */
function withPlaybooks(files, baseText, check) {
  const root = mkdtempSync(join(tmpdir(), "pstack-playbook-contracts-"));

  try {
    const project = join(root, ".agents/playbooks");
    const bundled = join(root, "bundled");
    mkdirSync(project, { recursive: true });
    mkdirSync(bundled);
    writeFileSync(join(bundled, "base.md"), baseText);

    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(project, name), text);
    }

    check(root, bundled);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("playbook diagnostics retain filename sorting and per-file check order", () => {
  withPlaybooks(
    {
      "z.md": "---\nextends: missing\n---\n",
      "a.md": "---\nextends: missing\n---\n",
      "ignored.txt": "ignored",
      "Ω.md": "---\nextends: missing\n---\n",
    },
    "",
    (root, bundled) => {
      expect(checkPlaybooks(root, bundled)).toEqual([
        '.agents/playbooks/a.md: its frontmatter needs a "when:" line',
        ".agents/playbooks/a.md: extends `missing`, which this pstack has no playbook for",
        '.agents/playbooks/z.md: its frontmatter needs a "when:" line',
        ".agents/playbooks/z.md: extends `missing`, which this pstack has no playbook for",
        '.agents/playbooks/Ω.md: its frontmatter needs a "when:" line',
        ".agents/playbooks/Ω.md: extends `missing`, which this pstack has no playbook for",
      ]);
    },
  );
});

test.each([" ", "\t", "\u00A0", "\u2028\u2029"])(
  "anchor matching retains whitespace folding for %j",
  (whitespace) => {
    withPlaybooks(
      {
        "custom.md": `---\nextends: base\nwhen: needed\n---\n- **After** "First${whitespace}second": act\n`,
      },
      "First\n\tsecond",
      (root, bundled) => {
        expect(checkPlaybooks(root, bundled)).toEqual([]);
      },
    );
  },
);
