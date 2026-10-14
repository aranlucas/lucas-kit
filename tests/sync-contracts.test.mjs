import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { classify, denylistHits, isExcluded, syncComponent } from "../tools/sync.mjs";

/** @type {string[]} */
const fixtures = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} files */
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "sync-contracts-"));
  fixtures.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

// Isolate builtin fault injection from the test runner and the real git tests.
/** @param {string} source */
function probe(source) {
  const scratch = tree({});
  const script = `
    import childProcess from "node:child_process";
    import { existsSync, readdirSync } from "node:fs";
    import { basename, dirname } from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const calls = [];
    const reads = [];
    let failure;
    childProcess.execFileSync = (file, args, options) => {
      calls.push({ file, args, options });
      throw failure;
    };
    syncBuiltinESMExports();
    const { mergeFile, denylistHits } = await import(${JSON.stringify(new URL("../tools/sync.mjs", import.meta.url).href)});
    ${source}
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, TMPDIR: scratch },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe("sync subprocess contracts", () => {
  test.each([1, 127])(
    "preserves the command, byte result, hunk count and cleanup for exit %s",
    (status) => {
      expect(
        probe(`
      const bytes = Buffer.from("<<<<<<< local\\nport\\n=======\\nupstream\\n>>>>>>> upstream\\n");
      failure = { status: ${status}, stdout: bytes };
      const result = mergeFile(Buffer.from("ours"), Buffer.from("base"), Buffer.from("theirs"));
      const call = calls[0];
      const scratch = dirname(call.args.at(-1));
      console.log(JSON.stringify({
        clean: result.clean, hunks: result.hunks, sameBytes: result.buffer === bytes,
        file: call.file,
        args: [...call.args.slice(0, -3), ...call.args.slice(-3).map((path) => basename(path))],
        options: call.options, scratchRemoved: !existsSync(scratch), calls: calls.length,
      }));
    `),
      ).toBe(
        JSON.stringify({
          clean: false,
          hunks: status,
          sameBytes: true,
          file: "git",
          args: [
            "merge-file",
            "-p",
            "--no-diff3",
            "-L",
            "local",
            "-L",
            "base",
            "-L",
            "upstream",
            "ours",
            "base",
            "theirs",
          ],
          options: { stdio: ["ignore", "pipe", "inherit"] },
          scratchRemoved: true,
          calls: 1,
        }),
      );
    },
  );

  test.each([0, -1, 128, 129, 255, null])(
    "rethrows the original error for non-conflict exit %s",
    (status) => {
      expect(
        probe(`
      failure = { status: ${JSON.stringify(status)}, stdout: Buffer.from("<<<<<<< local") };
      let caught;
      try { mergeFile(Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)); } catch (error) { caught = error; }
      console.log(JSON.stringify({ same: caught === failure, scratch: readdirSync(process.env.TMPDIR) }));
    `),
      ).toBe('{"same":true,"scratch":[]}');
    },
  );

  test("reads inherited status and stdout in the original order without normalizing them", () => {
    expect(
      probe(`
      const bytes = Buffer.from("<<<<<<< local");
      failure = Object.create({
        get status() { reads.push("status"); return 2; },
        get stdout() { reads.push("stdout"); return bytes; },
      });
      const result = mergeFile(Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0));
      console.log(JSON.stringify({ reads, hunks: result.hunks, same: result.buffer === bytes }));
    `),
    ).toBe('{"reads":["status","status","stdout","status","stdout"],"hunks":2,"same":true}');
  });

  test("checks conflict status before markers and keeps the thrown value as cause", () => {
    expect(
      probe(`
      failure = {
        get status() { reads.push("status"); return 7; },
        get stdout() { reads.push("stdout"); return Buffer.from("no markers"); },
      };
      let caught;
      try { mergeFile(Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)); } catch (error) { caught = error; }
      console.log(JSON.stringify({ reads, message: caught.message, cause: caught.cause === failure, scratch: readdirSync(process.env.TMPDIR) }));
    `),
    ).toBe(
      JSON.stringify({
        reads: ["status", "status", "stdout", "status"],
        message: "git merge-file reported conflicts (exit 7) but printed no markers",
        cause: true,
        scratch: [],
      }),
    );
  });

  test.each(["null", "undefined", "{ status: Symbol('status') }", "{ status: 1, stdout: {} }"])(
    "preserves native property/comparison/method failures for %s",
    (expression) => {
      expect(
        probe(`
        failure = ${expression};
        let caught;
        try { mergeFile(Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)); } catch (error) { caught = error; }
        console.log(JSON.stringify({ type: caught.constructor.name, scratch: readdirSync(process.env.TMPDIR) }));
      `),
      ).toBe('{"type":"TypeError","scratch":[]}');
    },
  );
});

describe("sync text and lazy-file contracts", () => {
  test("exclusions match exact paths and directory boundaries with the same trailing-slash handling", () => {
    for (const excluded of ["docs", "docs/"]) {
      expect(isExcluded("docs", [excluded])).toBe(true);
      expect(isExcluded("docs/a.md", [excluded])).toBe(true);
      expect(isExcluded("docs-other/a.md", [excluded])).toBe(false);
    }
  });

  test("a missing denylist regex still uses the empty pattern and preserves its printed value", () => {
    expect(denylistHits("a.md", "one\ntwo", [{ hint: "empty matcher" }])).toEqual([
      'a.md:1: "undefined" — empty matcher',
      'a.md:2: "undefined" — empty matcher',
    ]);
    expect(denylistHits("a.md", "one", [{ token: "", hint: "empty token" }])).toEqual([
      'a.md:1: "" — empty token',
    ]);
  });

  test("a malformed null regex retains native coercion rather than becoming an empty pattern", () => {
    expect(
      probe(`
      console.log(JSON.stringify(denylistHits("a.md", "null\\nother", [{ regex: null, hint: "native matcher" }])));
    `),
    ).toBe(JSON.stringify(['a.md:1: "null" — native matcher']));
  });

  test("an unchanged local copy never reads the unused old version", () => {
    /** @type {import("../tools/sync.mjs").UpstreamFile} */
    const old = {
      mode: 0o644,
      counts: new Map(),
      /** @returns {never} */
      get bytes() {
        throw new Error("unused old bytes");
      },
    };
    const bytes = Buffer.from("current\n");
    const current = { mode: 0o644, bytes, counts: new Map() };
    expect(classify({ old, new: current, local: current })).toEqual({
      kind: "unchanged",
      kept: bytes,
    });
  });

  test("compares a fork's old version without introducing an old symlink lookup", () => {
    /** @type {string[]} */
    const reads = [];
    /**
     * @param {string} name
     * @param {string} text
     * @returns {import("../tools/sync.mjs").UpstreamFile}
     */
    const version = (name, text) => ({
      /** @returns {false} */
      get symlink() {
        reads.push(`${name}.symlink`);
        return false;
      },
      get bytes() {
        reads.push(`${name}.bytes`);
        return Buffer.from(text);
      },
      get mode() {
        reads.push(`${name}.mode`);
        return 0o644;
      },
      counts: new Map(),
    });
    const result = classify({
      old: version("old", "base\n"),
      new: version("new", "base\n"),
      local: version("local", "base\nport\n"),
    });
    expect(result).toEqual({ kind: "forked", kept: Buffer.from("base\nport\n"), changed: 1 });
    expect(reads).toEqual([
      "new.symlink",
      "local.symlink",
      "local.bytes",
      "new.bytes",
      "local.bytes",
      "local.bytes",
      "old.bytes",
      "local.bytes",
      "old.bytes",
      "new.bytes",
      "old.bytes",
      "old.mode",
      "new.mode",
      "local.bytes",
      "old.bytes",
      "local.bytes",
      "old.bytes",
      "local.bytes",
    ]);
  });

  test("derives new then old exactly once despite repeated lazy getter reads", () => {
    const oldDir = tree({ "a.md": "base\n" });
    const newDir = tree({ "a.md": "base\n" });
    const localDir = tree({ "a.md": "base\nport\n" });
    /** @type {string[]} */
    const derived = [];
    const report = syncComponent({
      oldDir,
      newDir,
      localDir,
      rules: [],
      dryRun: true,
      derive: (rel, text) => {
        derived.push(`${rel}:${text}`);
        return text;
      },
    });
    expect(derived).toEqual(["a.md:base\n", "a.md:base\n"]);
    expect(report.forked).toEqual([{ rel: "a.md", changed: 1 }]);
    expect(readFileSync(join(localDir, "a.md"), "utf8")).toBe("base\nport\n");
  });

  test("keeps equal-sized forks in path discovery order and reports larger forks first", () => {
    const base = { "a.md": "base\n", "b.md": "base\n", "z.md": "base\n" };
    const local = { "a.md": "base\na\n", "b.md": "base\nb\n", "z.md": "base\nz\nz\n" };
    const report = syncComponent({
      oldDir: tree(base),
      newDir: tree(base),
      localDir: tree(local),
      rules: [],
      dryRun: true,
    });
    expect(report.forked).toEqual([
      { rel: "z.md", changed: 2 },
      { rel: "a.md", changed: 1 },
      { rel: "b.md", changed: 1 },
    ]);
  });
});
