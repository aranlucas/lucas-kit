# Lucas Kit feature roadmap

Updated 2026-10-26. Proposed product work for maintainers using the kit in owned
repositories. Digits/MCP delivery takes portfolio priority. Time and quota
savings below are hypotheses to measure, not demonstrated results.

## Starting point

At `191468f0e016ccbdd30a17112e894c4dbc7a6d3f`, the [kit](README.md) already
packages planning, implementation and review workflows through pnpm-managed
skills. T3 provides orchestration, model preferences are configurable, and the
port has explicit upstream/fork boundaries. Installation and native CLI entry
points do not need to be reinvented.

## Ordered releases

1. **Choose the amount of work before starting it.** Offer concise workflow
   choices for a small fix, a feature, or a deep investigation, showing expected
   stages, delegation and stop conditions. Acceptance: the selected scope stays
   visible in the handoff; small changes do not automatically acquire multiple
   independent reviews; missing enforcement capabilities are disclosed rather
   than represented as hard spending limits.
2. **Resume from a compact, evidence-backed handoff.** Standardize the small set
   of facts needed to continue: intended outcome, current checkout/head, changed
   behavior, completed checks and the next unresolved decision. Acceptance:
   resumed work revalidates changing Git/tool state while retaining finished
   analysis; stale reports cannot imply that tests or merges happened again.
   Use the host's durable state instead of a parallel task database.
3. **Make model/capability mismatches actionable.** Improve setup and workflow
   entry guidance so an unavailable requested model or tool produces a precise
   next step before expensive delegation. Acceptance: user-selected models and
   settings are preserved; no silent fallback, invented tool capability or
   repeated failing child launch occurs.
4. **Understand an upgrade before adopting it.** Provide a concise release
   impact view covering changed workflow behavior, required host capabilities
   and deliberate port policies. Acceptance: the published artifact matches
   the described version, consumer installation remains pnpm-owned, and an
   update does not imply a user's permissions or model choices changed.

## First slice and evaluation

Start with the small-fix workflow choice and one concise completion record. Try
it on five representative owned-repository changes. Record completed user
outcomes, elapsed time, repeated reads/checks and reported model usage where the
host supplies it. Unknown usage is not zero. Compare with the existing workflow
before adding a new abstraction or expanding delegation.

Follow [CONTRIBUTING.md](CONTRIBUTING.md): behavior changes to skills declare
their policy/port fork and follow the release/version process. Preserve native
package management and the existing tests; add no installer or monitoring daemon.
