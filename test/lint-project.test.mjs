import { expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { runPnpm } from "@/tools/pnpm.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const lintReport = Type.Object({
  number_of_files: Type.Number(),
  diagnostics: Type.Array(
    Type.Object({
      code: Type.String(),
      labels: Type.Array(Type.Object({ span: Type.Object({ line: Type.Number() }) })),
    }),
  ),
});

test("type-aware lint resolves Node and ES2023 APIs while retaining unsafe JSON diagnostics", () => {
  // Keep the probe inside the root project so this exercises automatic discovery.
  const directory = mkdtempSync(join(root, "test/lint-project-fixture-"));
  const probe = join(directory, "probe.mjs");
  try {
    writeFileSync(
      probe,
      [
        'import { readFileSync } from "node:fs";',
        'export const contents = readFileSync(import.meta.filename, "utf8");',
        "export const sorted = [3, 1, 2].toSorted();",
        "export const parsed = JSON.parse(contents);",
        "parsed.method();",
        "",
      ].join("\n"),
    );
    const result = runPnpm(
      [
        "exec",
        "oxlint",
        "-A",
        "all",
        "-D",
        "typescript/no-unsafe-assignment",
        "-D",
        "typescript/no-unsafe-call",
        "-D",
        "typescript/no-unsafe-member-access",
        "--format",
        "json",
        probe,
      ],
      { cwd: root },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    /** @type {unknown} */
    const report = JSON.parse(result.stdout);
    if (!Value.Check(lintReport, report)) throw new Error("Invalid Oxlint JSON report");
    expect(report.number_of_files).toBe(1);
    expect(
      report.diagnostics
        .map(({ code, labels }) => ({ code, line: labels[0].span.line }))
        .toSorted((left, right) => left.code.localeCompare(right.code)),
    ).toEqual([
      { code: "typescript(no-unsafe-assignment)", line: 4 },
      { code: "typescript(no-unsafe-call)", line: 5 },
      { code: "typescript(no-unsafe-member-access)", line: 5 },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
