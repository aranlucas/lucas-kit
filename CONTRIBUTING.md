# Contributing

Lucas Kit is the T3-specific fork of [pstack-claude](https://github.com/michael-denyer/pstack-claude), which ports [Cursor's pstack](https://github.com/cursor/plugins/tree/main/pstack). Read the [design decisions](docs/lucas-kit-design.md) before changing that boundary.

## The sync boundary

Prefer merging reviewed pstack-claude updates so this fork keeps the port's translations and upstream ownership records. Preserve Lucas Kit's identity, independent `VERSION`, T3 model policy, and absent root plugin manifest; resolve generated-file conflicts by regenerating after the source conflicts are settled.

The inherited Cursor sync machinery uses three sources:

- [tools/upstream.json](tools/upstream.json): component pins, local paths, and exclusions.
- [tools/substitutions.json](tools/substitutions.json): mechanical rewrites and denylist, with a rationale for each rewrite. Rules run in order; put a longer pattern before a shorter pattern it contains.
- [tools/forks.json](tools/forks.json): deliberate per-file departures, classified as `port-feature` or `policy`, with `why`, `since`, and `upstream` (`not-proposed` or a proposal URL).

A skill behavior change belongs here as a declared policy fork. Runtime adaptations are port features. Keep changes focused: each subsequent upstream sync must reconcile them. The T3 overlay is maintained on top of pstack-claude; do not treat its inherited Cursor pins as the version of Lucas Kit.

### Running a sync

Use this procedure when deliberately updating a Cursor component rather than merging the port. Capture one exact upstream SHA and preview it:

```shell
upstream_sha=$(git ls-remote https://github.com/cursor/plugins.git refs/heads/main | cut -f1)
pnpm sync pstack "$upstream_sha" --dry-run
```

Review the ownership report, then apply with `pnpm sync pstack "$upstream_sha"`. Substitute `cursor-team-kit` or `thermos` for other components. Their local paths overlap, so finish one before starting another. Use the pinned SHA with `--dry-run` to audit current forks without advancing them.

The sync performs a three-way merge. Text conflicts are written with Git markers and still advance the pin on a successful run; resolve every hunk before regenerating. A failure writes nothing. Binary conflicts, symlinks, obstructing paths, and denylist hits require manual resolution before rerunning. Never resolve an obstruction by deleting unrelated files.

Declare deliberate forks in the same PR. A file deleted locally but still tracked upstream needs an exclusion or a later sync can restore it. Remove a stale fork declaration when upstream absorbs the difference. Review files reported as now port-only, including locally edited files that upstream deleted, and record consequential decisions in the release notes.

## Before you open a PR

Use Node.js 26 and the pnpm version in `packageManager`. Install once, then run checks appropriate to your change:

```shell
pnpm install --frozen-lockfile
pnpm generate:check
pnpm test
```

`pnpm generate:check` is read-only. After changing a source of generated content, run `pnpm generate` and commit the output. It checks the working tree, so passing with unstaged generated edits does not prove the commit is complete. The optional `prek install` / `pre-commit install` hook runs this same check; Husky runs lint-staged.

Edit the sources rather than generated copies:

- `VERSION` and the matching `CHANGES.md` release heading own versions.
- [models.json](plugins/pstack/models.json) owns role defaults and runtime model tables; the user's sheet overrides choices at runtime. Add no model IDs to ordinary skill prose.
- Each skill's `name` and `description` frontmatter owns discovery. Every public skill needs a row in the [slash-command table](docs/reference.md#slash-commands), which owns Codex menu descriptions and ordering.
- Runtime mappings' per-skill tables own their generated preambles. Portable agent references and legal notices are copied from their originals.

### Things that will fail CI

The [CI workflow](.github/workflows/ci.yml) is authoritative for pinned tools and job configuration. These local checks cover common failures:

| Change | Check or constraint |
| --- | --- |
| Skill links and packaged resources | `node tools/validate-skills.mjs plugins/pstack/skills`; local links must stay inside the skills tree. Backticked paths must not direct an installed skill to files it cannot carry. |
| Skill layout and generated output | `pnpm generate:check`; no `commands/` directory, `disable-model-invocation`, stray runtime preambles, or unresolved conflict markers. Principle skills remain non-public; agent references stay namespaced. |
| First-party runtime code | `pnpm lint:runtime`; bounded source check used by CI. `pnpm lint` also reports source debt outside that subset. |
| Root tests | `pnpm lint:test` and targeted `pnpm test <test-file>`; `pnpm test` runs test lint first. |
| Markdown | `pnpm dlx markdownlint-cli2@0.18.1 '**/*.md'`; correctness rules are in [.markdownlint-cli2.jsonc](.markdownlint-cli2.jsonc). |
| Relative links and anchors | `lychee --offline --include-fragments --exclude-path node_modules --exclude-path .git '**/*.md'`; remote URLs are skipped. |
| pnpm skill packaging | `PSTACK_REQUIRE_PNPM_SKILLS=1 pnpm test:pnpm`; checks approval, packaged resources, executable bits, offline reinstall, and revocation. |
| Shell | `shellcheck --severity=warning <changed-script.sh>`; CI checks every shell script. |
| Workflows | `uvx zizmor@1.29.0 --persona pedantic --min-severity low --collect all -- .`; scanning only `.github/workflows/` misses Dependabot config. Pin actions to full commit SHAs with version comments. |

Maintainer CLI entry points use `import.meta.main`; `test/cli-entrypoints.test.mjs` covers execution through symlinks, inert imports, and failure propagation. Preserve those contracts when changing tools.

If changing inherited Pi code or `pi-tools.md`, run `pnpm typecheck:pi` against the external Pi version selected in CI, plus `test/pi/catalog.test.mjs` and `test/pi/runtime.test.mjs`. `PI_PACKAGE_DIR` selects an explicit installation; [tools/pi-package.mjs](tools/pi-package.mjs) defines other search locations. The development Pi dependency and CI's external compatibility target can differ; consult the manifest and workflow rather than assuming one version.

If changing `skills/poteto-mode/scripts/`, run its separate frozen install, `pnpm typecheck`, and `pnpm test` from that directory. CI also checks its upstream Prettier settings with `pnpm dlx prettier@3.6.2 --check .`; preserve the documented exclusions in `.prettierignore`.

### Checks requiring credentials or external effects

These checks are conditional, incur external effects, and are not part of an offline documentation check:

- `test/skill-collision-repro.sh` makes a real Claude model call to verify slash invocation without a `commands/` directory. Run before a release affecting discovery.
- `PSTACK_PI_LIVE=1 pnpm test test/pi/live.test.mjs` makes real model calls against a signed-in Pi. Provider/model overrides are defined in [the live harness](test/pi/live-harness.mjs).
- `test/copilot-smoke.sh` uses a signed-in Copilot CLI, a temporary config home, and about twenty premium requests. Run for inherited hook, Copilot mapping, or setup changes. It does not establish Lucas Kit workflow support outside T3.
- `node watch-pr/live-merge-safety.mjs --live-disposable`, from the vendored scripts directory, creates, merges in, and deletes a private GitHub repository. It needs `delete_repo` scope; if deletion fails it prints a manual cleanup command. Run before a release changing `watch-pr/`, with authorization for those effects.

Report exact checks run, skipped checks, and material limits in the PR. Bug reports should include the Lucas Kit version, host version, and reproduction steps.

## Releasing

Plugin auto-update installs by version number. A skill behavior change must bump the version or be followed by a release PR. Edit `VERSION`, add a `## <version> - <title>` entry to `CHANGES.md`, then run `pnpm generate`. Run the relevant checks above before releasing; do not describe a skipped live check as passed.

Merging a `VERSION` change to `main` runs [release.yml](.github/workflows/release.yml); manual dispatch also requires `main`. It validates the tree, builds the skills archive with `pnpm pack:skills`, stages it on npm through trusted publishing, then attests and publishes a GitHub release.

Staging does not make the npm version available to consumers. A maintainer must approve it with 2FA under Staged Packages on npmjs.com or with `pnpm stage approve <stage-id>`. The GitHub release can therefore exist before the npm package is approved. Do not publish the private development checkout directly.

### Recovery

Published npm versions and GitHub releases are skipped; an existing GitHub draft is resumed. If staging succeeded before a later failure, approve or reject the pending stage before starting a new workflow run. Pending stages reserve their version but are invisible to `pnpm view`, and OIDC cannot list them. Rerunning only the failed GitHub job reuses the successful staging job.

Assemble assets in a draft before publication: immutable releases lock the tag and assets. Keep dependency execution in the build job and publishing permissions in the isolated publishing jobs.

### One-time setup

- On npmjs.com, configure the trusted publisher for `aranlucas/lucas-kit`, workflow `release.yml`, environment `npm`, allowing staged publication: `npm trust github @aranlucas/kit-skills --repo aranlucas/lucas-kit --file release.yml --env npm --allow-stage-publish`. Require 2FA and disallow publishing tokens for the package.
- Enable immutable GitHub releases and restrict the `npm` environment's deployment branches to `main`.
