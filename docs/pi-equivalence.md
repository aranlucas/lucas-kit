# Inherited Pi adapter

Lucas Kit's workflows require T3 Code on Claude Code or Codex; Pi is not a supported host. The [Pi extension](../plugins/pstack/pi/index.ts) and [mapping](../plugins/pstack/skills/poteto-mode/references/pi-tools.md) are inherited from pstack-claude to preserve the port's merge boundary.

For adapter maintenance, use the offline contracts under [test/pi/](../test/pi/) and the [conditional Pi checks](../CONTRIBUTING.md#before-you-open-a-pr). Historical live runs against Pi 1.1 do not establish compatibility with the current development dependency or T3 workflow support. Use [pstack-claude](https://github.com/michael-denyer/pstack-claude) for standalone Pi installation.
