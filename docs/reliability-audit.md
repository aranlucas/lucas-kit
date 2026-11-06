# Reliability audit — 2026-11-06

## Baseline and scope

Audit starts from remote default `505362617d36dbf0a5e7e1fa78296cbbef2f02c4`,
after merged PR #40. The bound worktree was clean. All execution of tests and
builds is restricted to CI; local work is static inspection only.

## Interface and boundary inventory

- Skills and runtime manifests: discovery, generated prompt mappings, model
  aliases and notices must agree across Claude, Codex, Copilot, Gemini and Pi.
- Session hooks: decode local model sheets, honor opt-out, serialize Copilot JSON,
  and gate shell tools. Local configuration and tool input are trust boundaries.
- Pi extension: agent launch/steer/stop/resume, persisted session records,
  child RPC streams, process identity, worktree creation/cleanup, user questions,
  path-triggered skills and scheduled loops. Child messages and restored records
  require validation; cleanup must retain user work and avoid unrelated processes.
- Maintainer CLIs: generation/check, upstream three-way sync, skill validation,
  archive staging and release-note extraction. Disk writes, symlinks, upstream
  inputs and subprocess exit statuses are the important failure boundaries.
- Bundled orchestration and shipping CLIs: lock ownership, ledger/frontier state,
  atomic GitHub merge conditions, deadlines and retry classification. External
  GitHub operations remain unexercised outside controlled CI fixtures.
- Distribution: pnpm skill install, portable resources, bundled lockfiles,
  executable modes, notices, and release resumption. Existing CI covers generated
  invariants, fixture tests, skills install, two Pi versions, vendored TypeScript,
  shell lint and local documentation links. Release packaging also needs PR CI.
- Lean/TLA specifications and docs describe scheduler/lock contracts; they are
  supporting evidence, not substitutes for runtime regression checks.

No hosted application, account database, tenant API or production credential
store exists here. Authentication is delegated to host runtimes/GitHub; the audit
focuses on the local and subprocess boundaries actually implemented.

## Findings under investigation

### R1: release notes treat fenced examples as release boundaries

- Location: `tools/release-notes.mjs`, `releaseNotes`, section splitting.
- Trigger: a valid changelog entry includes a fenced Markdown example containing
  `## ...`, or a code example of the requested release precedes its actual entry.
- Expected: publish the whole real release section, preserving code examples;
  reject a version found only inside a code block.
- Actual: the regex splits even inside fences, truncating notes or selecting a
  fake heading. The generator already ignores fenced examples when validating
  release headings, so its accepted input can be mispublished by the release CLI.
- Confidence: high, independently confirmed by static review. Moderate impact,
  conditional on this valid input; no claim that existing releases are corrupt.
- Fix plan: use the maintained typed `mdast-util-from-markdown` parser for actual
  top-level heading positions and retain original source bytes for the body.
  Do not hand-write another Markdown parser. Assert real CLI output and missing
  release refusal in CI, including a pre-fix reproduction.

Public API and structural cleanup are outside the change.

## Framework applicability

The real npm `e2e` package was fetched for inspection, without running install
scripts or tests: published version 0.23.0, repository tester-army/e2e, Node
`^22.22.3 || >=24.8.0` (compatible with this repository's Node 26).
Read its bundled quickstart, CI, GitHub Actions, API testing, configuration and
fixture guides after the documentation URLs failed to fetch. API testing
explicitly supports engine-less targets; `test.extend` supplies a disposable CLI
checkout. The real runner executes the release CLI, verifies the complete output
file and title, then requests an absent release and verifies failure with no
output corruption. No model, browser, mobile engine or credentials are needed.
The exact core version is pinned in the lockfile. `@e2e-dev/web` and
`@e2e-dev/mobile` have no applicable product surface here.

Existing protocol/CLI regression coverage remains intact. A new CI job proves
both fence variants fail on the audited baseline before checking the fixed code,
runs the e2e journey, builds the distribution, and uploads baseline logs and e2e
reports. Dependency selection: `e2e@0.23.0` is the explicitly requested upstream
runner; `mdast-util-from-markdown@2.0.3` parses Markdown rather than introducing
another handwritten general-purpose parser.

## Rejected hypotheses and validation limits

- Zero-second fixed `/loop` input does not cause a tight timer: execution clamps
  intervals to 60 seconds. Parsing alone would have produced a false finding.
- Sync writes conflict markers and advances the pin intentionally; its documented
  maintainer workflow requires resolving them before generation. This is not
  evidence that a conflict-free success contract is broken.
- Existing worktree cleanup checks branch and detached reflog commits, ignored
  output, registration and common repository identity. Do not replace these
  safeguards with a superficial clean-status check.

## Evidence and outcome

[CI run 42301563971](https://github.com/aranlucas/lucas-kit/actions/runs/42301563971)
validated the implementation at `d6deefe`: both fence regressions failed on the
baseline with the expected truncated-body diffs, all 11 fixed release tests
passed, the real e2e CLI journey passed, and the distribution build succeeded.
[Evidence artifact](https://github.com/aranlucas/lucas-kit/actions/runs/42301563971/artifacts/13543343805)
contains the baseline log and e2e report/JUnit results. Remaining repository gates
must also pass on the final PR head before merge.

[PR #41](https://github.com/aranlucas/lucas-kit/pull/41) contains this audit and fix.
No local test/build results are claimed.

Independent review completed across the listed surfaces and challenged R1 and
its implementation. No additional concrete worthwhile finding was identified.
The review accepted the CLI harness and noted that CI must establish runtime and
lint compatibility. Concurrent writes to one store instance and overlapping path
skills were rejected as findings: the current CLI serializes calls and the
bundled path-triggered skill has no overlapping peer.
