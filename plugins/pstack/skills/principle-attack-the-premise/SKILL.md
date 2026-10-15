---
name: principle-attack-the-premise
description: "Apply when two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it."
user-invocable: false
---

# Attack the Premise

When two or more fixes that share one premise have failed the same gate, suspect the premise, not the fixes.

**Why:** Each failed fix is evidence against the belief it assumed. A third fix on the same premise spends effort where the evidence already says the cause is not.

**Pattern:**
- **Write the premise down.** The premise is the one sentence that every failed fix assumed.
- **Test the premise before the next fix.** Pick an observation whose result would differ if the premise were false, and make it rerunnable per [Build the Lever](../principle-build-the-lever/SKILL.md). For actor imbalance, count how much each actor holds. The census shows who holds the imbalance, not how large it is.
- **Follow the evidence.** If the same few actors hold most of the imbalance on each run, find what assigns them that role. If the check contradicts the premise, look for what the failures share that the premise did not predict. The assignment is the next "why" per [Fix Root Causes](../principle-fix-root-causes/SKILL.md); earlier fixes may have treated a consequence instead of the cause.
- **Remove the condition instead of compensating for it**, per the [Laziness Protocol](../principle-laziness-protocol/SKILL.md). Rotate the role between actors, randomize the assignment, or move the role so no actor holds it on every run. If the evidence shows one part always lands on the losing side, change what puts it there. A return path, shared pool, batched hand-off, or periodic rebalance leaves the assignment in place and adds work on every run.
- **When the premise is not about actors**, use a rerunnable check whose result would differ if the premise were false. Two timeout increases assume requests reach the intended destination; log the actual destination before the third.

**Stop:** Do not start the next fix before the premise is written down and tested.

This principle is distinct from [Redesign from First Principles](../principle-redesign-from-first-principles/SKILL.md), which rebuilds a design around a new requirement. It questions a fact the current design assumes.
