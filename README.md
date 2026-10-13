# Lucas Kit

`@aranlucas/kit-skills` brings Lucas Kit's coding workflows into your project through [pnpm agent skills](https://pnpm.io/agent-skills). It includes planning, implementation, code review, PR workflows, and the principles they share.

These workflows require **T3 Code's MCP tools**. pnpm manages installation and agent discovery; T3 supplies the delegation and orchestration tools the skills call.

## Install

Use **pnpm 12.11.0 or newer**. In your project's `pnpm-workspace.yaml`, choose where pnpm should install the skills:

```yaml
skills:
  dirs:
    - .agents/skills
    - .claude/skills
```

Then add the package as a direct development dependency:

```shell
pnpm add -D --save-exact @aranlucas/kit-skills
pnpm approve
pnpm install
```

Select the skills capability for `@aranlucas/kit-skills` in the approval prompt. pnpm saves your decision alongside the directory configuration:

```yaml
permissions:
  '@aranlucas/kit-skills':
    skills: true
```

Approval applies to all bundled skills and future versions of the package. For automation, commit the reviewed permission and restore dependencies with `pnpm install --frozen-lockfile`.

Commit `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the skill directories' `.gitignore` files. pnpm creates links such as `.agents/skills/pnpm-@aranlucas+kit-skills-poteto-mode` and ignores them with `pnpm-*`. The links point into `node_modules` and are recreated on installation.

## Use

Start a new T3 thread after installation so the agent discovers the skills. Ask it to use `setup-pstack` to configure your models, then invoke a workflow by name:

```text
Use poteto-mode to fix the search filter.
Use architect to plan the cache redesign.
Use thermo-nuclear-review to review this change.
```

Model preferences live in `lucas-kit-models.md`. The [workflow reference](https://github.com/aranlucas/lucas-kit/blob/main/docs/reference.md) lists the available skills and their behavior.

The npm package includes the complete `skills/` tree, its supporting scripts and references, and the license notices. It has no runtime dependencies or install scripts. Individual workflow scripts may need their own tools when you run them; follow the selected skill's instructions. Automatic session routing is available through the [full Lucas Kit plugin](https://github.com/aranlucas/lucas-kit/tree/main/plugins/pstack).

Install one copy of these skills per agent directory so their names do not overlap. Agent skills must be project dependencies; global installations and `pnpm dlx` do not create skill links.

## Update or remove

```shell
pnpm update --latest @aranlucas/kit-skills
pnpm remove -D @aranlucas/kit-skills
```

Removing the dependency removes its managed links. To keep the dependency while disabling discovery, set its `skills` permission to `false` and run `pnpm install`.

## Vendor or contribute

For repositories that commit dependencies as archives, follow the [tarball vendoring guide](https://github.com/aranlucas/lucas-kit/blob/main/docs/pnpm-skills.md). It covers building the same package locally, source-specific approval, and frozen offline installation.

Maintainers use pnpm from the source checkout:

```shell
pnpm install --frozen-lockfile
pnpm generate:check
pnpm test
pnpm pack:skills
```

See [CONTRIBUTING.md](https://github.com/aranlucas/lucas-kit/blob/main/CONTRIBUTING.md) for development runtimes, upstream sync boundaries, and release checks.

## License and credits

MIT. Lucas Kit is maintained by [Lucas](https://github.com/aranlucas). It builds on Christian Bager Bach Houmann's t3-pstack, Michael Denyer's pstack-claude port, and Lauren Tan's pstack and thermos. Original copyright notices are included in the package's `LICENSE`, `LICENSE-cursor-team-kit`, `LICENSE-thermos`, and `NOTICE-skills.md`.
