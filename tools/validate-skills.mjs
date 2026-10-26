#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// The one directory walker for every tool in tools/. `node_modules` under
// poteto-mode/scripts is gitignored but present on any machine that ran the
// vendored tooling's install, and its READMEs are not ours to validate.
/** @type {ReadonlySet<string>} */
export const SKIPPED_DIRS = new Set([".git", "node_modules"]);

// Sorted, so reports and scans read the same on every filesystem.
/**
 * Return sorted files below a directory, excluding dependency and Git directories.
 * @param {string} dir
 * @returns {readonly string[]}
 */
export function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );
  return entries.flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/**
 * Return Markdown files in the same deterministic order as walk().
 * @param {string} dir
 * @returns {readonly string[]}
 */
export function markdownFiles(dir) {
  return walk(dir).filter((path) => path.endsWith(".md"));
}

/**
 * @param {string} text
 * @returns {readonly string[]}
 */
function markdownTargets(text) {
  const targets = [];
  for (const [, raw] of text.matchAll(/\]\(([^)\n]*)\)/g)) targets.push(destination(raw));
  for (const [, raw] of text.matchAll(/^\s{0,3}\[(?!\^)[^\]\n]+\]:\s*(.+)$/gm)) {
    targets.push(destination(raw));
  }
  return targets.filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function destination(raw) {
  const value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    return close === -1 ? value : value.slice(1, close);
  }

  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (/\s/.test(char)) break;
    if (char === "\\" && i + 1 < value.length) {
      out += value[i + 1];
      i += 1;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Compare lexical paths; callers resolve symlinks separately when required.
 * @param {string} root
 * @param {string} path
 * @returns {boolean}
 */
export function pathIsInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// A backticked path in prose is not a markdown link, so validateSkillsTree
// never sees it; that is how codex-tools.md came to tell the reader to open
// agents/comment-sicko.md, a file a skills-only install lacks. The defect is
// a filesystem fact: the token names something that exists in the plugin
// (beside the skills tree, or reachable through ../) but not inside the
// tree. Tokens that resolve to nothing are placeholders, slash commands, or
// maintainer notes and are left alone.
/**
 * @param {string} text
 * @param {string} file
 * @param {string} root
 * @returns {readonly string[]}
 */
function prosePathProblems(text, file, root) {
  const pluginRoot = dirname(root);
  const problems = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1];
    if (!token.includes("/") || /\s/.test(token) || isAbsolute(token)) continue;
    const candidates = [resolve(dirname(file), token), resolve(pluginRoot, token)];
    const outside = candidates.find((path) => existsSync(path) && !pathIsInside(root, path));
    if (outside) {
      problems.push(
        `${relative(root, file)} -> ${token} (${relative(pluginRoot, outside)} is not installed with the skills tree)`,
      );
    }
  }
  return problems;
}

/**
 * Reject prose references to existing plugin resources outside the installed skills.
 * Missing tokens remain valid placeholders. Filesystem errors propagate unchanged.
 * @param {string} skillsDir
 * @returns {void}
 */
export function validateProsePaths(skillsDir) {
  const root = resolve(skillsDir);
  const problems = [];
  for (const file of markdownFiles(root)) {
    problems.push(...prosePathProblems(readFileSync(file, "utf8"), file, root));
  }
  if (problems.length) {
    throw new Error(`prose names paths outside the skills tree:\n${problems.join("\n")}`);
  }
}

/** @param {string} target */
function isNonLocalTarget(target) {
  if (target.startsWith("#") || target.startsWith("//")) return true;
  const scheme = target.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return Boolean(scheme && scheme !== "file");
}

/**
 * Return the first path problem, preserving the lexical-before-realpath checks.
 * @param {string} target
 * @param {string} file
 * @param {string} root
 * @param {string} realRoot
 * @returns {string | undefined}
 */
function localTargetProblem(target, file, root, realRoot) {
  if (isNonLocalTarget(target)) return;
  const encodedPath = target.split(/[?#]/, 1)[0];
  if (!encodedPath) return;

  let path;
  try {
    path = decodeURIComponent(encodedPath);
  } catch {
    return "invalid URI encoding";
  }

  const resolved = resolve(dirname(file), path);
  if (/^file:/i.test(target) || isAbsolute(path) || !pathIsInside(root, resolved)) {
    return "escapes skills tree";
  }
  if (!existsSync(resolved)) return "missing";
  if (!pathIsInside(realRoot, realpathSync(resolved))) return "escapes skills tree through symlink";
}

/**
 * Reject missing, malformed or escaping local Markdown destinations.
 * Remote schemes, anchors and query-only links are ignored. File URLs are rejected.
 * Diagnostics follow sorted file order, with inline links before reference links.
 * Filesystem read errors propagate immediately, before accumulated diagnostics.
 * @param {string} skillsDir
 * @returns {void}
 */
export function validateSkillsTree(skillsDir) {
  const root = resolve(skillsDir);
  const realRoot = realpathSync(root);
  const problems = [];
  for (const file of markdownFiles(root)) {
    for (const target of markdownTargets(readFileSync(file, "utf8"))) {
      const problem = localTargetProblem(target, file, root, realRoot);
      if (problem) problems.push(`${relative(root, file)} -> ${target} (${problem})`);
    }
  }
  if (problems.length) throw new Error(`invalid local markdown links:\n${problems.join("\n")}`);
}

if (import.meta.main) {
  const skillsDir = process.argv[2];
  if (!skillsDir) {
    console.error("usage: node tools/validate-skills.mjs <skills-directory>");
    process.exit(2);
  }
  try {
    validateSkillsTree(resolve(skillsDir));
    console.log(`ok: local markdown links stay inside ${skillsDir}`);
    validateProsePaths(resolve(skillsDir));
    console.log(`ok: no prose in ${skillsDir} points at a path outside it`);
  } catch (error) {
    // Preserve native message lookup and coercion for non-Error throws, including
    // inherited messages and the existing nullish/Symbol failures.
    // oxlint-disable-next-line typescript/restrict-template-expressions
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}
