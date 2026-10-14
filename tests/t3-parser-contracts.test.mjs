import { assert, describe, expect, test } from "vitest";

import {
  family,
  panelFamilies,
  parseEntry,
  parseSheet,
} from "../plugins/pstack/skills/setup-pstack/scripts/t3-sheet.mjs";

describe("T3 entry parser contracts", () => {
  test("concrete targets preserve property order and a fresh null-prototype option dictionary", () => {
    const parsed = parseEntry(
      " \tpool_1/gpt-6.1-sol\n__proto__=safe constructor=ctor toString=text negative=-1 10=ten 2=two ",
    );

    assert.exists(parsed);
    expect(Object.keys(parsed)).toEqual(["providerInstanceId", "model", "options"]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(parsed.providerInstanceId).toBe("pool_1");
    expect(parsed.model).toBe("gpt-6.1-sol");
    expect(Object.getPrototypeOf(parsed.options)).toBeNull();
    expect(Object.entries(parsed.options)).toEqual([
      ["2", "two"],
      ["10", "ten"],
      ["__proto__", "safe"],
      ["constructor", "ctor"],
      ["toString", "text"],
      ["negative", "-1"],
    ]);

    const empty = parseEntry("pool_1/gpt-6.1-sol");
    assert.exists(empty);
    expect(Object.getPrototypeOf(empty.options)).toBeNull();
    expect(Object.keys(empty.options)).toEqual([]);
    expect(empty.options).not.toBe(parsed.options);
  });

  test.each(["inherit-parent", "auto", " \tauto\r\n", "\ninherit-parent\t"])(
    "inheritance %j returns null",
    (text) => {
      expect(parseEntry(text)).toBeNull();
    },
  );

  test.each([
    ["", '"" does not start with <providerInstanceId>/<modelId>'],
    [" \t\n", '"" does not start with <providerInstanceId>/<modelId>'],
    ["AUTO", '"AUTO" does not start with <providerInstanceId>/<modelId>'],
    ["alias bad", '"alias bad" does not start with <providerInstanceId>/<modelId>'],
    [
      "pool/model/extra effort=high",
      '"pool/model/extra effort=high" does not start with <providerInstanceId>/<modelId>',
    ],
    ["auto broken", '"auto broken": auto takes no options'],
    [
      " inherit-parent effort=high ",
      '"inherit-parent effort=high": inherit-parent takes no options',
    ],
    ["pool/model @high", '"pool/model @high": "@high" is not <optionId>=<value>'],
    ["pool/model effort=", '"pool/model effort=": "effort=" is not <optionId>=<value>'],
    [
      "pool/model effort=high effort=",
      '"pool/model effort=high effort=": "effort=" is not <optionId>=<value>',
    ],
    [
      "pool/model effort=high effort=low broken",
      '"pool/model effort=high effort=low broken" sets "effort" twice',
    ],
    [
      "pool/model broken effort=high effort=low",
      '"pool/model broken effort=high effort=low": "broken" is not <optionId>=<value>',
    ],
    [
      "pool/model __proto__=one __proto__=two",
      '"pool/model __proto__=one __proto__=two" sets "__proto__" twice',
    ],
    [
      "pool/model constructor=one constructor=two",
      '"pool/model constructor=one constructor=two" sets "constructor" twice',
    ],
    [
      "pool/model toString=one toString=two",
      '"pool/model toString=one toString=two" sets "toString" twice',
    ],
  ])("malformed entry %j retains its first exact error", (text, message) => {
    expect(() => parseEntry(text)).toThrowError(new Error(message));
  });
});

describe("T3 panel family contracts", () => {
  test.each([
    ["claude-opus-5-5", "claude"],
    ["gpt-6.1-sol", "gpt"],
    ["grok", "grok"],
    ["", ""],
    ["-model", ""],
    ["GPT-6", "GPT"],
  ])("family %j is its first unnormalized segment", (model, expected) => {
    expect(family(model)).toBe(expected);
  });

  test("panels ignore inheritance and keep first-seen family order across providers", () => {
    const entries = Object.freeze([
      parseEntry("auto"),
      parseEntry("pool/grok-4.7"),
      parseEntry("codex_pool/claude-opus-5-5"),
      parseEntry("inherit-parent"),
      parseEntry("claudeAgent/claude-fable-5-1"),
      parseEntry("codex/gpt-6.1-sol"),
    ]);

    const families = panelFamilies(entries);
    expect([...families]).toEqual(["grok", "claude", "gpt"]);
    expect(panelFamilies([]).size).toBe(0);
    expect(panelFamilies([null, null]).size).toBe(0);
    expect(panelFamilies(entries)).not.toBe(families);
  });
});

describe("T3 sheet parser contracts", () => {
  test("BOM, CRLF, blank lines and column-zero headings retain original line numbers", () => {
    const parsed = parseSheet(
      "\uFEFF# Sheet\r\n \t\r\nsession hook: on\r\n#Heading\r\n\r\nbug-fix: pool/model\r\n",
    );

    expect(parsed).toEqual([
      { line: 3, key: "session hook", value: "on" },
      { line: 6, key: "bug-fix", value: "pool/model" },
    ]);

    for (const line of parsed) {
      expect(Object.keys(line)).toEqual(["line", "key", "value"]);
      expect(Object.getPrototypeOf(line)).toBe(Object.prototype);
    }

    expect(parseSheet("\uFEFF# Heading\r\n\t\r\n")).toEqual([]);
  });

  test.each([
    "a: pool/model",
    "bug-fix:  pool/model",
    "bug-fix: pool/model ",
    "bug-fix:",
    "  bug-fix: pool/model",
    "Bug-fix: pool/model",
    "- bug-fix: pool/model",
    "bug_fix: pool/model",
    " # Heading",
    "Delete a line to use the tier default.",
  ])("malformed line %j keeps own undefined key and value properties", (text) => {
    const parsed = parseSheet(`# Heading\n${text}\n`);
    expect(parsed).toEqual([{ line: 2, key: undefined, value: undefined }]);
    const [line] = parsed;
    assert.exists(line);
    expect(Object.keys(line)).toEqual(["line", "key", "value"]);
    expect(Object.hasOwn(line, "key")).toBe(true);
    expect(Object.hasOwn(line, "value")).toBe(true);
  });

  test("sheet parsing preserves values and leaves entry validation to its caller", () => {
    expect(
      parseSheet("feature, refactoring: pool/model  effort=high, auto\nbug-fix: invalid @entry"),
    ).toEqual([
      { line: 1, key: "feature, refactoring", value: "pool/model  effort=high, auto" },
      { line: 2, key: "bug-fix", value: "invalid @entry" },
    ]);
  });
});

test("panel filtering finishes before a model getter mutates later input entries", () => {
  /** @type {(import("../plugins/pstack/skills/setup-pstack/scripts/t3-sheet.mjs").ParsedTarget | null)[]} */
  const entries = [
    {
      providerInstanceId: "pool",
      options: {},
      get model() {
        entries[1] = null;

        return "gpt-1";
      },
    },
    { providerInstanceId: "pool", options: {}, model: "claude-1" },
  ];

  expect([...panelFamilies(entries)]).toEqual(["gpt", "claude"]);
  expect(entries[1]).toBeNull();
});

test("a later input getter failure precedes an earlier model getter failure", () => {
  const indexFailure = new Error("later input read failed");
  const modelFailure = new Error("earlier model read failed");

  /** @type {string[]} */
  const reads = [];

  const entries = [
    {
      providerInstanceId: "pool",
      options: {},
      /** @returns {string} */
      get model() {
        reads.push("model");
        throw modelFailure;
      },
    },
    { providerInstanceId: "pool", options: {}, model: "claude-1" },
  ];

  Object.defineProperty(entries, 1, {
    get() {
      reads.push("later input");
      throw indexFailure;
    },
  });
  /** @type {unknown} */
  let thrown;

  try {
    panelFamilies(entries);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(indexFailure);
  expect(reads).toEqual(["later input"]);
});
