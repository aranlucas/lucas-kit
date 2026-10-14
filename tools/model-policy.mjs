import { Type } from "typebox";
import { Value } from "typebox/value";

const selection = Type.Union([Type.String(), Type.Array(Type.String())]);
const role = Type.Object({
  role: Type.String(),
  skill: Type.String(),
  models: selection,
});
const policy = Type.Object({
  available: Type.Array(Type.String()),
  efforts: Type.Array(Type.String()),
  defaultEffort: Type.String(),
  tiers: Type.Record(Type.String(), selection),
  roles: Type.Array(role),
  codex: Type.Record(Type.String(), selection),
  t3: Type.Record(Type.String(), selection),
  pi: Type.Object({
    fallback: Type.String(),
    models: Type.Record(Type.String(), Type.Record(Type.String(), Type.String())),
  }),
});

/** @typedef {import("typebox").Static<typeof policy>} ModelPolicy */
/**
 * @typedef {object} ResolvedRole
 * @property {string} role
 * @property {string} skill
 * @property {string[]} models
 * @property {string} [tier]
 */
/** @typedef {Omit<ModelPolicy, "roles"> & { roles: ResolvedRole[] }} ResolvedModels */

/**
 * Structural proof after the generator's ordered, domain-specific checks.
 * This guard neither coerces values nor removes unknown properties.
 * @param {unknown} value
 * @returns {value is ModelPolicy}
 */
export function isModelPolicy(value) {
  return Value.Check(policy, value);
}
