# Vendor @aranlucas/kit-skills with pnpm

The [README](../README.md) documents installation from npm. This guide covers committing a locally built archive instead. Both paths produce the package-root `skills/<name>/SKILL.md` layout required by [pnpm agent skills](https://pnpm.io/agent-skills).

The source stays under `plugins/pstack/skills` for upstream syncs. The builder stages a separate, publishable `@aranlucas/kit-skills` package and packs it with pnpm. It includes the README, complete skill resources, executable scripts, and license notices; local dependencies and Git metadata are excluded. The archive has no lifecycle scripts, runtime dependencies, Pi extension, or plugin hooks.

## Build the archive

From the Lucas Kit checkout:

```shell
pnpm install --frozen-lockfile
pnpm generate:check
pnpm pack:skills
```

This writes `dist/aranlucas-kit-skills-<version>.tgz`, using the version generated from `VERSION`. To choose another output directory:

```shell
pnpm pack:skills /path/to/consumer/vendor
```

The builder removes its temporary staging directory after packing and validates skill links before packaging. The source checkout is private in `package.json` to prevent publishing the development package with its Pi peers; only the staged skills archive is configured for public npm publication. Building an archive does not publish it.

## Install in a consuming project

Copy the archive into the project's `vendor/` directory. With pnpm 12.11.0 or newer, first configure `pnpm-workspace.yaml`:

```yaml
skills:
  dirs:
    - .agents/skills
    - .claude/skills
```

Install and approve the archive:

```shell
pnpm add -D ./vendor/aranlucas-kit-skills-1.0.14.tgz
pnpm approve
pnpm install
```

Select the skills capability for `@aranlucas/kit-skills`. Local archives use a permission key that includes their source:

```yaml
permissions:
  '@aranlucas/kit-skills@file:vendor/aranlucas-kit-skills-1.0.14.tgz':
    skills: true
```

Commit the archive, dependency manifest, lockfile, workspace configuration, and generated skill-directory `.gitignore` files. A fresh checkout restores the links with `pnpm install --frozen-lockfile`. CI must include development dependencies when it needs the skills.

Links such as `pnpm-@aranlucas+kit-skills-poteto-mode` point into `node_modules`. Relative references resolve through the installed skill tree, while pnpm ignores its generated links. Start a fresh T3 thread and ask it to use `setup-pstack`, then invoke workflows by name.

## Update or remove

Build each update with a new version and filename. Copy it into `vendor/`, add the new archive with `pnpm add -D ./vendor/aranlucas-kit-skills-<new-version>.tgz`, approve that source, and run `pnpm install`. Remove the old archive and obsolete permission entry, then commit the changed lockfile and configuration.

`pnpm remove -D @aranlucas/kit-skills` removes the managed links. Setting the source's skills permission to `false` and running `pnpm install` also removes them.

## Verify or publish

```shell
PSTACK_REQUIRE_PNPM_SKILLS=1 pnpm test:pnpm
```

The tests compare every packaged resource's bytes and executable bits, then check scoped link names, approvals, sibling references, a frozen offline reinstall, and revocation. Requiring the integration test makes an older or missing pnpm fail instead of skip.

For a registry release, review the built archive and publish that artifact:

```shell
pnpm publish ./dist/aranlucas-kit-skills-1.0.14.tgz --access public
```

Use the current release version in both the archive name and installation examples. Registry approval is keyed by package name rather than the local archive's source; see the README's configuration.
