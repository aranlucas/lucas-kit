# Vendor lucas-kit skills with pnpm

[pnpm agent skills](https://pnpm.io/agent-skills) supports approved direct dependencies starting in pnpm 12.11.0. It discovers only `skills/<name>/SKILL.md` at the package root. lucas-kit's source tree is under `plugins/pstack/skills`, so adding the unmodified repository as a Git dependency does not expose its skills to pnpm.

The archive builder creates a separate, private `lucas-kit-skills` package with the expected layout. No registry publication is needed. It copies the complete skills tree, including principle leaves, scripts, cross-skill references, and license notices. It excludes local `node_modules`, Git metadata, and `.DS_Store`, and preserves script executable bits. The package has no lifecycle scripts, runtime dependencies, Pi extension, or plugin routing hooks.

## Build the archive

In the lucas-kit checkout, using Node.js and npm:

```shell
npm run pack:skills
```

The archive is written to `dist/lucas-kit-skills-<version>.tgz`, using the version from the root `package.json`. To choose another output directory:

```shell
node tools/pack-skills.mjs /path/to/consumer/vendor
```

The source skills stay in one place; staging files are removed after packing. The builder validates their local links before packaging. Maintainers should run `bun tools/generate.mjs --check` before building a release to verify generated content as well.

## Install in a consuming project

Copy the archive into the consuming project's `vendor/` directory. The examples below use version `1.0.13`; substitute the version you built.

In the consuming project's `pnpm-workspace.yaml`, merge this directory setting with any existing configuration. pnpm creates the directories if needed:

```yaml
skills:
  dirs:
    - .agents/skills
    - .claude/skills
```

Then, from the consuming project, using pnpm 12.11.0 or newer:

```shell
pnpm add -D ./vendor/lucas-kit-skills-1.0.13.tgz
pnpm approve
pnpm install
```

Select the skills capability for `lucas-kit-skills` during approval. pnpm records the decision in `pnpm-workspace.yaml`. For a local tarball the permission is keyed by its source, so the resulting entry is:

```yaml
permissions:
  'lucas-kit-skills@file:vendor/lucas-kit-skills-1.0.13.tgz':
    skills: true
```

This entry can also be added directly after reviewing the archive. Then run `pnpm install` to create the links.

Commit the archive, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the `.gitignore` files pnpm creates in the skill directories. The lockfile records the archive's integrity. A fresh checkout restores the installation with `pnpm install --frozen-lockfile`; CI must install dev dependencies when it needs these skills.

pnpm names links `pnpm-lucas-kit-skills-poteto-mode`, `pnpm-lucas-kit-skills-architect`, and so on. They point into `node_modules`; the skill frontmatter and relative references keep their original names. pnpm ignores these links with a `pnpm-*` rule. The committed tarball is the vendored artifact, and pnpm recreates the agent links on install.

Start a new T3 thread so its agent discovers the skills, then ask it to use `setup-pstack`. Invoke workflows by name, for example: `Use poteto-mode to fix the search filter.` Automatic routing requires the full plugin or a standing instruction configured separately. Avoid installing another skills-only copy of the same stack into the same agent directories, since the frontmatter names would overlap.

## Update or remove

Build an archive from the updated checkout, copy it into `vendor/`, and run `pnpm add -D ./vendor/lucas-kit-skills-<new-version>.tgz`. Approve the new source with `pnpm approve` and rerun `pnpm install`. Remove the old archive and obsolete permission entry after the dependency has moved to the new file, and commit the changed lockfile and configuration. Use a new version and filename for every update so a frozen installation identifies one immutable archive.

`pnpm remove -D lucas-kit-skills` removes the managed links. Setting its skills permission to `false` and running `pnpm install` also removes them.

## Verify the packaging path

```shell
bun test tests/pnpm-skills.test.mjs
```

The archive test checks every resource's bytes and executable bits. The pnpm test checks approval, every linked skill, sibling resources, a frozen offline reinstall, and revocation. It skips on pnpm versions older than 12.11.0. To require the integration test with a pinned pnpm without changing your global installation:

```shell
PSTACK_REQUIRE_PNPM_SKILLS=1 npm exec --yes --package=pnpm@12.11.0 -- bun test tests/pnpm-skills.test.mjs
```
