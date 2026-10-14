import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { packSkills } from "../tools/pack-skills.mjs";
import { runPnpm } from "../tools/pnpm.mjs";
import { validateSkillsTree, walk } from "../tools/validate-skills.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceSkills = join(repoRoot, "plugins/pstack/skills");
const sourcePackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const packageName = sourcePackage.name;
const linkPrefix = `pnpm-${packageName.replace("/", "+")}`;
const archiveName = `${packageName.replace(/^@/, "").replace("/", "-")}-${sourcePackage.version}.tgz`;
const pnpmVersion = runPnpm(["--version"]).stdout?.trim();
const [major, minor] = (pnpmVersion ?? "").split(".").map(Number);
const supportsSkills = major > 12 || (major === 12 && minor >= 11);

test("the skills archive carries every resource and license without plugin runtime dependencies", () => {
  const root = mkdtempSync(join(tmpdir(), "pstack-pack-test-"));
  try {
    // Include an installed dependency and OS metadata in a source fixture to
    // prove that developer-local files cannot leak into the archive.
    const fixture = join(root, "source");
    mkdirSync(fixture);
    cpSync(join(repoRoot, "package.json"), join(fixture, "package.json"));
    cpSync(join(repoRoot, "README.md"), join(fixture, "README.md"));
    for (const name of ["LICENSE", "LICENSE-cursor-team-kit", "LICENSE-thermos", "NOTICE-skills.md"]) {
      cpSync(join(repoRoot, name), join(fixture, name));
    }
    cpSync(sourceSkills, join(fixture, "plugins/pstack/skills"), { recursive: true, filter: (path) => !path.endsWith("/node_modules") });
    const scripts = join(fixture, "plugins/pstack/skills/poteto-mode/scripts");
    mkdirSync(join(scripts, "node_modules/fixture"), { recursive: true });
    writeFileSync(join(scripts, "node_modules/fixture/local.txt"), "local");
    writeFileSync(join(scripts, ".DS_Store"), "local");

    const archive = packSkills(fixture, join(root, "output"));
    const unpacked = join(root, "unpacked");
    mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", archive, "-C", unpacked]);
    const packed = join(unpacked, "package");
    const manifest = JSON.parse(readFileSync(join(packed, "package.json"), "utf8"));
    expect(manifest.name).toBe(packageName);
    expect(manifest.version).toBe(sourcePackage.version);
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig.access).toBe("public");
    expect(readFileSync(join(packed, "README.md"))).toEqual(readFileSync(join(repoRoot, "README.md")));
    for (const key of ["dependencies", "peerDependencies", "scripts", "pi"]) expect(manifest[key]).toBeUndefined();
    const installedSkills = join(packed, "skills");
    const resources = (dir) => walk(dir).map((file) => relative(dir, file)).filter((file) => !file.endsWith(".DS_Store"));
    expect(resources(installedSkills)).toEqual(resources(sourceSkills));
    for (const file of resources(sourceSkills)) {
      expect(readFileSync(join(installedSkills, file))).toEqual(readFileSync(join(sourceSkills, file)));
      expect(lstatSync(join(installedSkills, file)).mode & 0o111).toBe(lstatSync(join(sourceSkills, file)).mode & 0o111);
    }
    expect(existsSync(join(installedSkills, "poteto-mode/scripts/node_modules"))).toBe(false);
    for (const name of ["LICENSE", "LICENSE-cursor-team-kit", "LICENSE-thermos", "NOTICE-skills.md"]) {
      expect(readFileSync(join(packed, name))).toEqual(readFileSync(join(repoRoot, name)));
    }
    validateSkillsTree(installedSkills);
    expect(readdirSync(join(root, "output"))).toEqual([archiveName]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);

test.skipIf(!supportsSkills && !process.env.PSTACK_REQUIRE_PNPM_SKILLS)("pnpm approves, links, reinstalls, and revokes the vendored skills", () => {
  expect(supportsSkills, `pnpm >=12.11.0 required; found ${pnpmVersion}`).toBe(true);
  const root = mkdtempSync(join(tmpdir(), "pstack-pnpm-test-"));
  try {
    const vendor = join(root, "vendor");
    const archive = packSkills(repoRoot, vendor);
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ private: true, packageManager: sourcePackage.packageManager, devDependencies: {
      [packageName]: `file:vendor/${relative(vendor, archive)}`,
    } })}\n`);
    const settings = "skills:\n  dirs:\n    - .agents/skills\n    - .claude/skills\n";
    const permission = (approved) => `permissions:\n  '${packageName}@file:vendor/${relative(vendor, archive)}':\n    skills: ${approved}\n`;
    const workspace = join(root, "pnpm-workspace.yaml");
    const install = (...args) => {
      const result = runPnpm(["install", ...args], { cwd: root, env: { ...process.env, CI: "true" } });
      expect(result.status, result.error?.message ?? result.stdout + result.stderr).toBe(0);
    };
    const skillNames = readdirSync(sourceSkills).filter((name) => existsSync(join(sourceSkills, name, "SKILL.md")));
    writeFileSync(workspace, settings);
    install();
    expect(existsSync(join(root, `.agents/skills/${linkPrefix}-poteto-mode`))).toBe(false);

    writeFileSync(workspace, settings + permission(true));
    install("--frozen-lockfile");
    for (const dir of [".agents/skills", ".claude/skills"]) {
      const skills = join(root, dir);
      for (const name of skillNames) {
        const link = join(skills, `${linkPrefix}-${name}`);
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
        expect(readFileSync(join(link, "SKILL.md"))).toEqual(readFileSync(join(sourceSkills, name, "SKILL.md")));
      }
      // Resolve a real cross-skill path through the installed symlink, including
      // a principle leaf. pnpm's prefixed link names must not break siblings.
      const architect = join(skills, `${linkPrefix}-architect`);
      for (const file of ["../poteto-mode/references/t3-tools.md", "../principle-model-the-domain/SKILL.md"]) {
        expect(readFileSync(`${architect}/${file}`).length).toBeGreaterThan(0);
      }
      expect(readFileSync(join(skills, ".gitignore"), "utf8")).toContain("pnpm-*");
    }
    expect(readFileSync(join(root, "pnpm-lock.yaml"), "utf8")).toContain("integrity:");
    rmSync(join(root, "node_modules"), { recursive: true, force: true });
    install("--offline", "--frozen-lockfile");
    expect(readFileSync(join(root, `.agents/skills/${linkPrefix}-poteto-mode/SKILL.md`)).length).toBeGreaterThan(0);
    writeFileSync(workspace, settings + permission(false));
    install("--frozen-lockfile");
    expect(existsSync(join(root, `.agents/skills/${linkPrefix}-poteto-mode`))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
