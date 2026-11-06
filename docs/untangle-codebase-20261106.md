# Untangle decision log — 2026-11-06

## Scope and baseline

- Scope: the entire repository, including generation/sync tools, Pi extension,
  hooks, skills/reference prose, vendored command tooling, tests, and CI.
- Starting commit: `c17908d`. Working tree clean; no earlier edits to overwrite.
- Read root AGENTS.md and the requested caldoai untangle-codebase skill. Both
  optional additions (comments and tests) selected. Routine choices authorized.
- Preserve recent test pruning (#37), documentation pruning (#38), and explicit
  upstream fork policies in tools/forks.json. Generated copies and vendored
  prose are intentional distribution boundaries, not independent sources.
- No local tests, benchmarks, browser tests, or test builds. No local test
  session was started by this thread. Behavioral verification belongs to CI.
  Local baseline failures are therefore unknown, not assumed absent.

## Inventory before implementation

### One distribution notice table for packaging and generated portable assets

Problem: tools/pack-skills.mjs lists the same license/notice sources that
tools/generate.mjs independently lists in PORTABLE_ASSETS. Adding a license
requires coordinated edits in two implementations; a missed edit can omit
attribution from one distribution. The standalone notice intentionally retains
its source filename, while the portable tree calls it NOTICE.md.

Decision: tools/plugin.mjs owns the source-to-portable-filename table. Both
consumers derive their respective lists. Keep independent test expectations
for the actual files users must receive. No new library or script is needed;
this is repository-specific distribution metadata using native object entries.

### Boundaries and special cases retained

- Generator plans and upstream sync share derivation functions intentionally:
  sync must compare generated port forms rather than raw upstream files.
- Runtime-specific manifests, model renderers and validators are already
  colocated in tools/runtimes.mjs. Do not force distinct runtime formats into
  one generic schema or split modules merely because of line counts.
- Pi runtime imports remain independent of development tools and YAML. Its
  small frontmatter reader serves shipped agent/paths fields, whereas the
  generator validates full YAML. Unifying them would add runtime dependencies.
- Worktree identity checks, orphan PID verification, process-group shutdown,
  grace periods and retained output protect user work. Keep these special
  cases and their behavioral tests. Platform/permission skips describe actual
  unavailable capabilities, not disabled regressions.
- One-shot scheduling restrictions and idle retries follow Pi lifecycle and
  compaction behavior. Keep external-contract comments and test scenarios.
- Existing CI covers root behavioral tests, skills-only installation, package
  canary, Pi catalog/runtime compatibility and vendored script tests. No
  speculative workflow replacement is warranted.
- Tests removed in #37 stay removed. Existing distribution assertions catch
  missing notices and broken links; do not derive expected files from the new
  table, which would make omissions pass against themselves.

### Remove implementation-only commentary

Inventory: tools/plugin.mjs describes its exported constants, tools/runtimes.mjs
narrates roleSkills, and tools/validate-skills.mjs repeats walker ordering and
Markdown filtering in prose. Remove those restatements while retaining JSDoc
parameter/return types and explanations of external contracts. No test removal
is justified: the independent reviewer found the remaining sampled tests
protect behavior after #37.

## Review and validation

- First independent static review completed: notice duplication confirmed; no
  other worthwhile structural findings across the repository boundaries.
- Strengthen the existing required-portable-assets behavior test: the generated
  plan must include each independently listed required file with its current
  shipped contents. Credible regression: omitting a notice from the shared
  table could leave a committed copy present but cause generation to prune it.
  Expected files come from distribution requirements, not SKILL_NOTICES.
- Baseline GitHub CI for c17908d succeeded (run 41930761883). This is CI evidence,
  not a local test result.
- Second independent static review completed: no worthwhile remaining findings
  or introduced regressions. Notice sources, destinations and order preserved;
  external-contract commentary and behavioral tests retained.
- Static whitespace review (`git diff --check`) clean. No local behavioral tests
  run; no dependency installation or builds performed. PR CI pending.
