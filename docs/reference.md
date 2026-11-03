# Lucas Kit reference

Start with the [README](../README.md) for pnpm installation and your first task.

## Slash commands

In T3's Claude Code host, use `/lucas-kit:<name>`. In Codex, request a skill by name; the [optional shortcuts](#codex) provide the `/name` form below. The [skills tree](../plugins/pstack/skills/) contains the full instructions and non-public principle references.

| command | use it when |
| --- | --- |
| `/poteto-mode` | default entry point for any non-trivial task |
| `/be-ambitious` | deepen a task or prompt with expert methods, primary sources, and external verification while keeping its scope |
| `/in-your-own-words` | restate the user’s goal and the problem to solve |
| `/sharpen` | sharpen the approach, goal, scope, and outside check before starting |
| `/how` | walk through how a subsystem works |
| `/why` | investigate why something was built this way (parallel multi-MCP evidence) |
| `/architect` | settle types and module shape before writing code that crosses a function boundary |
| `/arena` | run N parallel attempts at the same task and pick the best parts |
| `/interrogate` | have three different models try to break a diff |
| `/automate-me` | draft your own personal -mode skill from recent transcripts |
| `/reflect` | capture a long task's lessons as a skill edit |
| `/correct` | find the mistakes agents keep repeating in a repo and make each one impossible, enforced at the highest level that works |
| `/tdd` | fix a bug by writing the failing test first, then the fix |
| `/benchmark-checklist` | vet a measured speedup or regression (limiter, tuning, errors, repeat runs, end-to-end relevance) before you report or act on it |
| `/typescript-best-practices` | ground type-system discipline in TypeScript syntax |
| `/teach` | explain a subsystem plainly by composing how + why |
| `/swarm` | fan out N parallel workers across slices or races, then return one aggregated report |
| `/technical-writing` | write docs, RFCs, readmes, PR descriptions, and commit messages to one layered standard |
| `/bro` | restate the last message in plain human language, no jargon |
| `/figure-it-out` | design a rigorous, auditable playbook for a task no bundled playbook fits |
| `/show-me-your-work` | log decisions to a reviewable tsv decision trail |
| `/blast-radius` | find what a change could break beyond the diff and prove safety by running code |
| `/recall` | catch up on recent working context from chat history, live state, and the shared record |
| `/ketchup` | catch up on everything in this chat since your last message, with an executive summary for each action item |
| `/ketchup-video` | catch up like `/ketchup`, as a short silent slide video with the waiting calls as text |
| `/setup-pstack` | configure pstack per-role model choices |
| `/poteto-help` | answer a question about pstack with the prompt to send and the file the answer came from |
| `/unslop` | clean up writing by removing AI tells |
| `/no-comments` | strip comments before review, fix the accepted findings, encode claimed constraints |
| `/create-verification-skill` | generate a project-local verification skill and feature map |
| `/maintain-verification-skill` | re-sync a drifted verification skill and its feature map |
| `/create-formal-verification-skill` | generate a project-local skill that formally verifies the code where a bug costs most and tests reach least |
| `/maintain-formal-verification-skill` | bring a formal verification skill back in line with code that changed under it |
| `/statechart` | draw how a system moves between states as a Mermaid statechart from a TLA+ model, with each bug as a numbered path |
| `/deslop` | deslop a diff before commit |
| `/babysit` | monitor an open PR, fix CI/comments, keep it merge-ready |
| `/thermo-nuclear-review` | audit a branch's changes for bugs, breakage, security issues, devex regressions, and feature-gate leaks |
| `/thermo-nuclear-code-quality-review` | extremely strict maintainability audit |
| `/thermos` | run both thermo-nuclear reviews as parallel subagents and synthesize their findings |
| `/make-pr-easy-to-review` | clean noisy history and improve PR description before review |
| `/fix-ci` | find failing PR checks, inspect logs, apply focused fixes |
| `/fix-merge-conflicts` | non-interactively resolve merge conflicts, validate, finalize |
| `/get-pr-comments` | fetch and summarize review comments from the active PR |
| `/what-did-i-get-done` | summarize authored commits over a user-chosen period |


## Runtime support

Lucas Kit workflows require **T3 Code on a Claude Code or Codex host**. The [T3 mapping](../plugins/pstack/skills/poteto-mode/references/t3-tools.md) governs dispatch, model choices, schedules, PRs, transcripts, and UI evidence. On Codex, the [Codex mapping](../plugins/pstack/skills/poteto-mode/references/codex-tools.md) covers the remaining host tools. Read upstream `pstack:<name>` references in skill bodies as `lucas-kit:<name>`.

Pi, GitHub Copilot, Prime Agent, opencode, Gemini CLI, and standalone Claude Code/Codex are not supported workflow hosts for this fork. Inherited adapters and discovery metadata remain for upstream compatibility; their presence does not supply T3's tools. For standalone runtimes, use [pstack-claude](https://github.com/michael-denyer/pstack-claude).

### Automatic routing

The full Claude Code and Codex plugins load a [routing instruction](../plugins/pstack/hooks/session-start-context.md) that invokes `poteto-mode` for multi-file changes, design decisions, and bugs with an unknown cause. Explicit user instructions take precedence. A skills-only pnpm installation has no startup hook; request a workflow by name.

Run `setup-pstack` in T3 to choose models. The host's sheet is `lucas-kit-models.md` under `$CLAUDE_CONFIG_DIR` (default `~/.claude`) or `$CODEX_HOME` (default `~/.codex`). Provider IDs and available options can differ by machine; validate choices against that machine's catalog. Set `session hook: off` in the sheet to disable automatic routing.

### Claude Code

For the full plugin, register the marketplace and install it from T3's Claude Code host:

```text
/plugin marketplace add aranlucas/lucas-kit
/plugin install lucas-kit@lucas-kit
```

Use `/lucas-kit:setup-pstack`, then invoke workflows with the same namespace. Install one copy per host to avoid overlapping skill names.

### Codex

The [marketplace catalog](../.agents/plugins/marketplace.json) and [plugin manifest](../plugins/pstack/.codex-plugin/plugin.json) register the shared skills and [SessionStart hook](../plugins/pstack/hooks/codex-hooks.json). Register this repository's marketplace through Codex's plugin interface and review the hook through `/hooks`. For project-local discovery, use the [pnpm installation](../README.md#install).

Optional slash-command shortcuts can be linked from a persistent clone. Run from its root:

```shell
mkdir -p ~/.codex/prompts
for c in plugins/pstack/.codex-plugin/prompts/*.md; do
  target=~/.codex/prompts/"$(basename "$c")"
  test -e "$target" || test -L "$target" || ln -s "$(pwd)/$c" "$target"
done
```

The loop skips existing entries. Keep the clone in place; remove a shortcut by deleting only its link at `~/.codex/prompts/<name>.md`. Shortcuts are optional for both plugin and pnpm installations.

## Workflow dependencies

The bundled PR and orchestration CLIs need Node.js 26 and pnpm; their bootstrap installs locked dependencies on first use. GitHub operations use your authenticated `gh` CLI. Workflows targeting Origin need its `origin` CLI. Follow the selected skill's instructions for additional tools.

Claude Code authoring workflows that request `plugin-dev:skill-development` need the companion plugin:

```text
/plugin marketplace add anthropics/claude-plugins-official
/plugin install plugin-dev@claude-plugins-official
```

Codex uses the [authoring equivalent in its mapping](../plugins/pstack/skills/poteto-mode/references/codex-tools.md#driver-and-bundled-skills-pstack-references).

## Maintenance

The [slash-command table](#slash-commands) is generator input: retain its header `| command | use it when |`, one row per public skill, and `poteto-mode` first. Its descriptions and order become the generated Codex prompt menu.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for source ownership, checks, and release recovery; [design decisions](lucas-kit-design.md) explain the fork boundary. [CHANGES.md](../CHANGES.md) records release behavior. Licenses and attribution are in [NOTICE.md](../NOTICE.md) and [NOTICE-skills.md](../NOTICE-skills.md).
