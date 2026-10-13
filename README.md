# lucas-kit

Lucas's fork of [t3-pstack](https://github.com/chhoumann/t3-pstack), maintained as **Lucas Kit**. The plugin and marketplace id is `lucas-kit`; the vendored package is `lucas-kit-skills`.

pstack for [T3 Code](https://github.com/pingdotgg/t3code). It is [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's Claude Code and Codex port of Lauren Tan's (poteto's) [pstack](https://github.com/cursor/plugins/tree/main/pstack), with one change: every subagent, panel, fan-out, schedule, and PR watch dispatches through T3's `t3-code` MCP tools. An `interrogate`, `arena`, or `architect` panel can then run Claude, GPT, and Grok reviewers side by side, from a Claude Code thread or a Codex thread. The mapping lives in [`t3-tools.md`](plugins/pstack/skills/poteto-mode/references/t3-tools.md).

lucas-kit works only inside T3. Outside T3, use pstack-claude.

## Install

| | Claude Code | Codex |
| --- | --- | --- |
| Plugin id | `lucas-kit@lucas-kit` | `lucas-kit@lucas-kit` |
| Marketplace repo | `aranlucas/lucas-kit` | `aranlucas/lucas-kit` |

Install from the Lucas Kit repository. For a local installation, replace `aranlucas/lucas-kit` below with this checkout’s absolute path.

```shell
claude plugin marketplace add aranlucas/lucas-kit && claude plugin install lucas-kit@lucas-kit
codex plugin marketplace add aranlucas/lucas-kit && codex plugin add lucas-kit@lucas-kit
```

Then run `/lucas-kit:setup-pstack` in a T3 thread on each machine. It writes `lucas-kit-models.md` in the host's config directory, with one T3 target per role (`<providerInstanceId>/<modelId>` plus that provider's options), and checks it against the machine's `orchestrator_capabilities`.

If you already configured t3-pstack, copy its `t3-pstack-models.md` to `lucas-kit-models.md` in the same host config directory before starting the renamed plugin. Enable one of these forks per runtime so their routing hooks and skills do not overlap.

### Vendor skills with pnpm

For a project-local skills installation, run `npm run pack:skills` in this checkout. It builds `dist/lucas-kit-skills-<version>.tgz` with the root `skills/` layout [pnpm agent skills](https://pnpm.io/agent-skills) requires. Commit that archive under the consuming project's `vendor/` directory and install it as a dev dependency with pnpm 12.11.0 or newer. See [the pnpm vendoring guide](docs/pnpm-skills.md) for directory configuration, approval, and updates.

This archive includes all skill resources and license notices. It is a skills-only install; automatic routing hooks and the Pi extension require the plugin installation above. The skills still require T3 Code's MCP tools. Run `setup-pstack` by name in a T3 thread after installation.

lucas-kit and pstack-claude never collide. They differ in plugin name (`lucas-kit` and `pstack`), marketplace (`lucas-kit` and `pstack-claude`), skill and agent namespace, and model sheet (`lucas-kit-models.md` and `pstack-models.md`). Both can be installed at once, though each injects its own routing instruction at session start, so enable one per runtime.

## Staying current

`upstream` is pstack-claude. Merge it with `git merge upstream/main`, then run `bun tools/generate.mjs` and `bun test tests/`. The overlay is mostly new files. The design and the list of upstream files it edits are in [`docs/lucas-kit-design.md`](docs/lucas-kit-design.md).

The sections below are pstack-claude's documentation, kept as upstream writes it. Their install commands install pstack-claude, not lucas-kit.

Tell `poteto-mode` your goal and it will invoke the correct workflow for the task. It keeps your code concise, simple and verified.

For concurrency bugs and invariants that tests cannot reach, see the separate [agent-formal-verify](https://github.com/michael-denyer/agent-formal-verify) plugin, which adds TLA+ model checking and Lean proofs.

## Install

### Claude Code

Run in Claude Code:

```text
/plugin marketplace add michael-denyer/pstack-claude
/plugin install pstack@pstack-claude
```

### Codex

Run in your terminal:

```shell
codex plugin marketplace add michael-denyer/pstack-claude
codex plugin add pstack@pstack-claude
```

### Pi

Run in your terminal:

```shell
pi install git:github.com/michael-denyer/pstack-claude
```

The package loads the skills and the pstack Pi extension, which adds the subagent, question, and wake-up tools the skills use, plus `/loop` and the routing instruction. Invoke a skill with `/skill:<name>`.

### GitHub Copilot

Run in your terminal:

```shell
copilot plugin marketplace add michael-denyer/pstack-claude
copilot plugin install pstack@pstack-claude
```

This installs pstack for the Copilot CLI and the GitHub Copilot app, which share `~/.copilot`. Start a new session afterwards. Copilot ships no default pstack models, so the first skill that needs one runs `setup-pstack` to pick from the models your account lists, and later sessions reuse that choice.

The Copilot build is tested on Copilot CLI 1.0.87 through 1.0.92. On those versions the routing hook's context reaches the session alongside other plugins' session-start context. If a later version keeps only one plugin's context, `setup-pstack` offers a [standing instruction](plugins/pstack/skills/setup-pstack/copilot.md#wire-it-in) for `~/.copilot/copilot-instructions.md` instead. On 1.0.92, once the CLI caches its computer-use experiment assignment, `copilot -p` sessions list no plugin skills and a `skill` call returns "Skill not found". Interactive sessions, the hooks, and the agents are unaffected.

Run `setup-pstack` to change model defaults, set a reasoning effort per role (for example `arena runners: opus @xhigh, fable @max`, which Claude Code dispatches through the plugin's `pstack:effort-<level>` or `pstack:poteto-agent-<level>` agents; roles without a level keep the session's effort unless the sheet's `default effort` line names one), or turn automatic routing off. The plugin installs the routing hook on Claude Code, Codex, and GitHub Copilot; Codex asks you to trust it through `/hooks` before it runs. On Pi the extension injects the same routing instruction. In Claude Code and the Copilot CLI, use `/pstack:setup-pstack`.

For Prime Agent, OpenCode, Gemini CLI, or skills-only installs for any harness, see [shared installation](docs/reference.md#shared-skills-installation).

## Getting started

```text
Use poteto-mode to fix the search filter resetting when I change pages.
```

For a bug, it reproduces the failure, uses `how` and `why` to investigate, delegates the fix, then reruns the failing case. If the fix crosses a function boundary, it brings in `architect` before implementation. You receive the fix and the failing and passing evidence.

[Other playbooks](plugins/pstack/skills/poteto-mode/SKILL.md#playbooks) cover planning, features, refactoring, performance issues, investigations, prototypes, PR maintenance, shipping, and longer projects.

![poteto-mode on Claude Code, Codex, and Pi turns a request into verified work. Choose a playbook, plan and delegate with architect, arena, or swarm, then review and verify with interrogate, tests, and measurements. Project playbooks customize the workflow, and setup-pstack configures the model and reasoning effort per role. Supporting skills include how, why, and unslop.](assets/pstack-overview.png)

## Details

- [Skills and slash commands](docs/reference.md#slash-commands)
- [Runtime setup](docs/reference.md#runtime-support)
- [Models and dependencies](docs/reference.md#configuration-and-dependencies)
- [Maintenance and port scope](docs/reference.md#maintenance)

## Data handling

pstack has no server or telemetry. Anything its skills ask your agent to read, including session transcripts, goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.

## Contributing

Thanks for helping make this port better. Bug reports, documentation fixes, and runtime improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks and where your change belongs. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Lucas Kit is [MIT-licensed](LICENSE), maintained by Lucas. This fork's modifications and additions are © 2026 Lucas. It builds on:

- [t3-pstack](https://github.com/chhoumann/t3-pstack), MIT, © 2026 Christian Bager Bach Houmann, the T3 orchestration fork this checkout derives from.
- [pstack-claude](https://github.com/michael-denyer/pstack-claude), MIT, © 2026 Michael Denyer, the Claude Code, Codex, and Pi port this fork tracks.
- [pstack](https://github.com/cursor/plugins/tree/main/pstack) in cursor/plugins, MIT, © 2026 Lauren Tan (poteto), the original skill stack.
- The skills imported from [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit), MIT, © 2026 Cursor. See [LICENSE-cursor-team-kit](LICENSE-cursor-team-kit).
- The skills and review agents imported from [thermos](https://github.com/cursor/plugins/tree/main/thermos), MIT, © 2026 Cursor. See [LICENSE-thermos](LICENSE-thermos).

[NOTICE.md](NOTICE.md) lists each upstream component with its source commit and license file.
