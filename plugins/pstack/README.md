# Lucas Kit plugin

Lucas Kit adapts Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack), through Michael Denyer's [pstack-claude](https://github.com/michael-denyer/pstack-claude), for T3 Code on Claude Code and Codex hosts.

Use the [project README](../../README.md) for pnpm installation, or the [plugin reference](../../docs/reference.md#runtime-support) for automatic routing and host setup. The [workflow table](../../docs/reference.md#slash-commands) helps choose a skill. Report bugs in [Lucas Kit issues](https://github.com/aranlucas/lucas-kit/issues); follow the [security policy](../../SECURITY.md) for vulnerabilities.

## Data handling

The plugin has no server or telemetry. Anything its skills ask your agent to read, including session transcripts, goes to your model provider. Scripts run locally; PR tools use your GitHub CLI login, and T3 handles delegated work.

## License

MIT. Original pstack © 2026 Lauren Tan; Claude Code port © 2026 Michael Denyer; imported cursor-team-kit skills © 2026 Cursor. Lucas Kit additions © 2026 Lucas. See [NOTICE.md](../../NOTICE.md) and the [license files](../../README.md#license-and-credits).
