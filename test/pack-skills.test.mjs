import { expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packSkills } from "@/tools/pack-skills.mjs";

test.each([{}, { name: null, version: "1.0.0" }, { name: "example", version: 1 }])(
  "invalid package metadata fails before creating an archive: %j",
  (metadata) => {
    const root = mkdtempSync(join(tmpdir(), "pstack-invalid-pack-"));
    try {
      mkdirSync(join(root, "plugins/pstack/skills"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify(metadata));

      expect(() => packSkills(root)).toThrow("package.json must contain a string name and version");
      expect(existsSync(join(root, "dist"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
