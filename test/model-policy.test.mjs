import { assert, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseModels, resolveModels } from "@/tools/generate.mjs";
import { isModelPolicy, usesTier } from "@/tools/model-policy.mjs";

const source = readFileSync(new URL("../plugins/pstack/models.json", import.meta.url), "utf8");

/**
 * @typedef {object} Replacement
 * @property {RegExp} pattern
 * @property {string} replacement
 */
/**
 * @typedef {object} MalformedPolicyCase
 * @property {string} name
 * @property {Replacement[]} replacements
 * @property {string} error
 * @property {number} [skillLookups]
 */
/** @type {MalformedPolicyCase[]} */
const malformed = [
  {
    name: "a non-string available model",
    replacements: [{ pattern: /"available": \[[^\]]*\]/, replacement: '"available": [42]' }],
    error: "models.json: available[0] must be a string",
    skillLookups: 0,
  },
  {
    name: "a non-object role",
    replacements: [{ pattern: /"roles": \[\s*\{[^}]*\}/, replacement: '"roles": [null' }],
    error: "models.json: roles[0] must be an object",
    skillLookups: 0,
  },
  {
    name: "a non-string role label",
    replacements: [{ pattern: /"role": "[^"]*"/, replacement: '"role": 42' }],
    error: "models.json: roles[0].role must be a string",
    skillLookups: 0,
  },
  {
    name: "a non-string skill path",
    replacements: [{ pattern: /"skill": "[^"]*"/, replacement: '"skill": 42' }],
    error: "models.json: roles[0].skill must be a string",
    skillLookups: 0,
  },
  {
    name: "a non-string Codex model",
    replacements: [
      { pattern: /("codex": \{\s*)"default": "[^"]*"/, replacement: '$1"default": 42' },
    ],
    error: 'models.json: codex "default" must name a model or list of models',
  },
  {
    name: "a non-string Codex panel member",
    replacements: [{ pattern: /("codex": \{[\s\S]*?"panel": )\[[^\]]*\]/, replacement: "$1[42]" }],
    error: 'models.json: codex "panel" must name a model or list of models',
  },
  {
    name: "a numeric Pi fallback that matches an object key",
    replacements: [
      { pattern: /"fallback": "[^"]*"/, replacement: '"fallback": 42' },
      { pattern: /"anthropic": \{/, replacement: '"42": {' },
    ],
    error: "models.json: pi.fallback must be a string",
  },
];

/** @param {readonly Replacement[]} replacements */
function replacedPolicy(replacements) {
  let text = source;

  for (const { pattern, replacement } of replacements) {
    expect(text).toMatch(pattern);
    text = text.replace(pattern, replacement);
  }

  return text;
}

test.each(["null", "[]", '"policy"', "42"])("rejects a non-object policy %s", (text) => {
  expect(() => parseModels(JSON.parse(text), () => true)).toThrow("models.json: must be an object");
});

test.each(malformed)(
  "rejects $name before claiming a validated policy",
  ({ replacements, error }) => {
    /** @type {unknown} */
    const input = JSON.parse(replacedPolicy(replacements));
    expect(isModelPolicy(input)).toBe(false);
    expect(() => parseModels(input, () => true)).toThrow(error);
  },
);

test.each(malformed.filter(({ skillLookups }) => skillLookups !== undefined))(
  "rejects $name before looking up skills",
  ({ replacements, error, skillLookups }) => {
    /** @type {unknown} */
    const input = JSON.parse(replacedPolicy(replacements));
    let lookups = 0;
    expect(() =>
      parseModels(input, () => {
        lookups += 1;
        return true;
      }),
    ).toThrow(error);
    expect(lookups).toBe(skillLookups);
  },
);

test("keeps existing top-level field errors ahead of later role errors", () => {
  const text = replacedPolicy([
    { pattern: /"efforts": \[[^\]]*\]/, replacement: '"efforts": null' },
    { pattern: /"role": "[^"]*"/, replacement: '"role": 42' },
  ]);

  expect(() => parseModels(JSON.parse(text), () => true)).toThrow(
    'models.json: "efforts" must be a list',
  );
});

test("keeps missing required tiers ahead of malformed available entries", () => {
  const text = replacedPolicy([
    { pattern: /("tiers": \{\s*)"default": "[^"]*",?/, replacement: "$1" },
    { pattern: /"available": \[[^\]]*\]/, replacement: '"available": [42]' },
  ]);

  expect(() => parseModels(JSON.parse(text), () => true)).toThrow(
    'models.json: tiers has no "default", which a stamped region renders from',
  );
});

test("validates without coercing, stripping extension fields, or mutating input", () => {
  const text = replacedPolicy([
    { pattern: /^\{/, replacement: '{"extension": {"keep": true},' },
    { pattern: /"role": /, replacement: '"extension": {"keep": true}, "role": ' },
  ]);

  /** @type {unknown} */
  const input = JSON.parse(text);
  const before = JSON.stringify(input);
  expect(isModelPolicy(input)).toBe(true);
  const result = parseModels(input, () => true);
  expect(result).toMatchObject({ extension: { keep: true } });
  expect(result.roles[0]).toMatchObject({ extension: { keep: true } });
  expect(JSON.stringify(input)).toBe(before);
});

test("resolved role lists retain their identity while tier roles resolve without mutation", () => {
  /** @type {unknown} */
  const input = JSON.parse(source);
  assert(isModelPolicy(input));

  const list = { role: "direct-list", skill: "how", models: ["opus"] };
  const tier = { role: "tier-reference", skill: "how", models: "default" };
  const policy = { ...input, roles: [list, tier] };
  const before = JSON.stringify(policy);

  expect(usesTier(list)).toBe(false);
  expect(usesTier(tier)).toBe(true);

  const resolved = resolveModels(policy);
  expect(resolved.roles[0]).toBe(list);
  expect(resolved.roles[1]).not.toBe(tier);
  expect(resolved.roles[1]).toEqual({
    ...tier,
    tier: "default",
    models: [input.tiers.default].flat(),
  });
  expect(JSON.stringify(policy)).toBe(before);
});
