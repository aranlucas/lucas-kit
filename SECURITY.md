# Security

Do not disclose vulnerability details in a public issue. Use **Report a vulnerability** on [Lucas Kit's security page](https://github.com/aranlucas/lucas-kit/security) when available. If private reporting is unavailable, ask [the maintainer](https://github.com/aranlucas) to establish a private channel, without including exploit details or secrets. Upstream pstack-claude's advisory form is for findings in that project, not a private inbox for this fork.

The skill tree, the hooks, the vendored Node.js scripts under `plugins/pstack/skills/poteto-mode/scripts`, and the CI workflows are all in scope. Anything that makes an agent run a command the user did not intend, exfiltrate a secret, or reach outside the repository it was pointed at counts, as does a supply-chain weakness in how this repository pins and installs its own dependencies. Findings in Claude Code itself belong to Anthropic, and findings in the upstream project this repository syncs from belong upstream.

Only the latest release on `main` receives fixes. Plugin auto-update installs by version number, so a fix ships as a new release rather than as a patch to an older one, and there are no maintained release branches to back-port to.
