# Lucas Kit design decisions

Lucas Kit targets T3 Code on Claude Code and Codex hosts. The [T3 mapping](../plugins/pstack/skills/poteto-mode/references/t3-tools.md) is the runtime contract; this note records why the fork has this shape.

## Extend the port rather than fork Cursor directly

Track [pstack-claude](https://github.com/michael-denyer/pstack-claude) so its Claude/Codex translations, hooks, generator, and upstream sync machinery remain reusable. Forking `cursor/plugins` directly would duplicate that maintenance. Inherited Pi and Copilot code stays to reduce merge conflicts; it does not make them supported Lucas Kit hosts.

A companion plugin would reduce merge cost further, but would require two installs and leave skill bodies without a direct pointer to the T3 mapping. The fork instead lets the generator enforce mapping coverage when skills or roles change.

## Keep one skill tree and separate runtime policy

Skill bodies retain upstream terminology to keep merges manageable. T3-specific dispatch and model policy lives in the mapping and model sheet, while ordinary tools follow the host. The generator stamps pointers from the runtime mappings' per-skill tables, so a direct skill invocation can discover its adaptation.

Lucas Kit has its own plugin identity, `lucas-kit-models.md` sheet, and release version. This prevents it from reading pstack-claude's model choices or sharing its auto-update identity. A sheet may be symlinked from dotfiles, but needs validation against each machine's provider catalog.

## Keep the Agent Plugins root manifest absent

Do not restore `plugins/pstack/plugin.json` during upstream merges. It caused Codex to load the plugin through a path that truncated long skill instructions. The host-specific manifests remain; [runtime packaging tests](../test/runtime-packaging.test.mjs) protect this decision.

## Keep publication separate from the development tree

The root package is private and includes inherited Pi development peers. [The packer](../tools/pack-skills.mjs) stages a skills-only package with licenses and complete supporting resources, without plugin hooks or the Pi extension. This lets pnpm own discovery and approval without installing runtime adapters. [Release recovery](../CONTRIBUTING.md#releasing) keeps staging, human approval, and immutable GitHub publication distinct.
