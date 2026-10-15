# Official release automation research

Researched 2026-10-15 for [PR #17](https://github.com/aranlucas/lucas-kit/pull/17), head `fad7b77cca1e2b496ebd69af3daf207fead43176`.

## Recommended actions and commands

Use `actions/setup-node` to install Node, then install the exact pnpm version from `package.json` with npm and run `pnpm install --frozen-lockfile`. `setup-node` supports pnpm caching but requires the package manager to be installed separately; set `package-manager-cache: false` for release jobs. This keeps all `uses:` dependencies under GitHub's `actions` organization. [setup-node documentation](https://github.com/actions/setup-node)

Installing pnpm using `npm install --global pnpm@12.11.0` is supported by pnpm's installation documentation. Reading that exact version from `packageManager` avoids maintaining a second version in the workflow. [pnpm installation](https://pnpm.io/installation)

`pnpm/setup` is maintained by pnpm, and its current integration installs both pnpm and Node and automatically installs project dependencies. It is a valid upstream action, but is not a GitHub-maintained action. Its current implementation also caches a lockfile verification record independently of `cache: false`, so the existing workflow's comment that it restores no cache is too broad. [pnpm setup](https://github.com/pnpm/setup), [pnpm CI instructions](https://pnpm.io/continuous-integration)

Keep GitHub CLI for releases. `actions/create-release` is archived and explicitly unmaintained. [create-release README](https://github.com/actions/create-release/blob/main/README.md)

Current `gh release create TAG ASSET --target SHA --title TITLE --notes-file FILE` creates a draft internally, uploads assets, and publishes through separate API calls. This is not atomic: a failed upload or publish can leave a draft. Explicit `--draft` followed by `gh release edit --draft=false` remains supported. Existing drafts must be resumed explicitly when recovering a failed run; a draft's existence does not establish that publication completed. [GitHub CLI release create](https://cli.github.com/manual/gh_release_create)

## npm trusted publishing and staged publishing

Trusted publishing supports GitHub-hosted runners and requires Node >=22.14.0, npm >=11.5.1, and `id-token: write`. Match the npm trusted publisher to user `aranlucas`, repository `lucas-kit`, workflow filename `release.yml`, and environment `npm`. Repository metadata in the published package must match. New trusted publisher connections expire if no successful publish occurs within two days. New connections allow staging; older connections may require stage permission to be enabled explicitly. OIDC provenance is generated automatically for public packages from public repositories. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

`npm stage publish` requires npm >=11.15.0 and Node >=22.14.0. Staging leaves the version unavailable to consumers until a maintainer approves it with 2FA using npm's Staged Packages page or `npm stage approve`. CI can stage with OIDC, but cannot complete the human approval step. [npm staged publishing](https://docs.npmjs.com/staged-publishing/)

A pending staged version reserves its version number. Publishing or staging the same version again fails; a retry must account for pending stages rather than treating public `npm view` returning 404 as proof that no stage exists. `npm stage publish` accepts a package spec, including the packed tarball, and respects `private: true`. [npm stage command](https://docs.npmjs.com/cli/v11/commands/npm-stage/)

`npm stage list` and other inspection/approval commands cannot use OIDC. Consequently a stage-only workflow cannot discover existing pending stages using `npm stage list --json`; recovery requires a maintainer to inspect and approve or reject the stage using interactive authentication. [npm OIDC limitations](https://docs.npmjs.com/trusted-publishers/#managing-dist-tags-with-trusted-publishing)

At research time Node 24.22.0 bundles npm 11.19.1, which supports staging. An explicit Node patch version or a CLI version check makes this requirement clearer than assuming all Node 24 releases bundle new enough npm. [Node release index](https://nodejs.org/dist/index.json)

## Attestations and immutable releases

`actions/attest` generates build provenance by default for `subject-path`, with permissions `id-token: write`, `attestations: write`, and `artifact-metadata: write`. Public repositories are supported on current GitHub plans; private repositories require Enterprise Cloud. [actions/attest documentation](https://github.com/actions/attest)

Immutable releases lock the published assets and tag and automatically receive a release attestation. Titles, notes, prerelease status, and latest status remain editable. GitHub recommends assembling assets in a draft before publishing. [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

Enable this in repository Settings, under Releases, with **Enable release immutability**; it applies only to future releases. [GitHub setup instructions](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)

## Verified existing action pins

The GitHub API resolved each existing tag to the exact SHA used in PR #17:

| GitHub-maintained action | Verified tag | SHA |
| --- | --- | --- |
| [actions/checkout](https://api.github.com/repos/actions/checkout/git/ref/tags/v7.0.1) | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [actions/setup-node](https://api.github.com/repos/actions/setup-node/git/ref/tags/v7.1.0) | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| [actions/upload-artifact](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v7.0.2) | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| [actions/download-artifact](https://api.github.com/repos/actions/download-artifact/git/ref/tags/v8.0.2) | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |
| [actions/attest](https://api.github.com/repos/actions/attest/git/ref/tags/v4.2.2) | v4.2.2 | `1e69f48acb82d1966a394da916b4c1698aa569d6` |

## Review implications

These are conclusions from reading the workflow, rather than claims made by the linked documentation:

- Distinguish a draft release from a published release when planning retries. Failure after draft creation currently leaves a draft that the next run skips.
- Report pending-stage failures clearly. Public `npm view` cannot establish the absence of a privately staged version.
- Publishing the GitHub release immediately after staging means the GitHub release can exist before npm approval. This needs to match the intended release policy.
- Preserve the isolated npm job: build and dependency execution occur before the job with publishing permission.
- Verify registry and release lookup errors instead of treating every failure as a missing version or release.
