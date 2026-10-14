import { expect, test } from "vitest";
import { validateHooks } from "@/tools/generate.mjs";

/** @param {readonly unknown[]} handlers */
function fileWith(handlers) {
  return JSON.stringify({ hooks: { Start: [{ hooks: handlers }] } });
}

const executable = { mode: 0o755 };
const plain = { mode: 0o644 };

test.each([null, [], true, 1, "hooks", {}, { hooks: { Start: {} } }])(
  "rejects malformed root %j before inspecting files",
  (value) => {
    /** @type {string[]} */
    const inspected = [];
    expect(() =>
      validateHooks(JSON.stringify(value), {
        statOf: (path) => {
          inspected.push(path);
          return executable;
        },
      }),
    ).toThrow();
    expect(inspected).toEqual([]);
  },
);

test("all documented non-command handlers need no filesystem lookups", () => {
  /** @type {string[]} */
  const inspected = [];
  const input = fileWith([
    {
      type: "http",
      url: "https://example.test",
      headers: { Accept: "text/plain" },
      allowedEnvVars: ["TOKEN"],
    },
    { type: "mcp_tool", server: "server", tool: "tool", input: { nested: [1, { ok: true }] } },
    { type: "prompt", prompt: "Review $ARGUMENTS", model: "model" },
    {
      type: "agent",
      prompt: "Review $ARGUMENTS",
      once: true,
      if: "condition",
      timeout: 5,
      statusMessage: "Working",
    },
  ]);
  expect(() =>
    validateHooks(input, {
      statOf: (path) => {
        inspected.push(path);
        return null;
      },
    }),
  ).not.toThrow();
  expect(inspected).toEqual([]);
});

test("schema faults skip only their handler and preserve later path checks and fault order", () => {
  /** @type {string[]} */
  const inspected = [];
  const input = fileWith([
    { type: "command", command: "${CLAUDE_PLUGIN_ROOT}/ignored", commandWindows: 5 },
    { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/entry" "${CLAUDE_PLUGIN_ROOT}/missing"' },
    { type: "__proto__" },
  ]);
  expect(() =>
    validateHooks(input, {
      file: "custom-hooks.json",
      statOf: (path) => {
        inspected.push(path);
        return path === "entry" ? plain : null;
      },
    }),
  ).toThrow(
    new Error(
      'custom-hooks.json:\n  Start: commandWindows must be string\n  Start: entry is not executable\n  Start: missing does not exist in the plugin\n  Start: hook type "__proto__" is not one of command, http, mcp_tool, prompt, agent',
    ),
  );
  expect(inspected).toEqual(["entry", "missing"]);
});

test("command references retain duplicates, platform order and first-reference executable checks", () => {
  /** @type {string[]} */
  const inspected = [];
  const input = fileWith([
    {
      type: "command",
      command: '"${CUSTOM_ROOT}/entry" "${CUSTOM_ROOT}/data" "${CUSTOM_ROOT}/data"',
      commandWindows: 'powershell -File "${CUSTOM_ROOT}/windows"',
      args: ["argument"],
      async: true,
      asyncRewake: false,
      shell: "bash",
    },
  ]);
  expect(() =>
    validateHooks(input, {
      root: "CUSTOM_ROOT",
      statOf: (path) => {
        inspected.push(path);
        return path === "entry" ? executable : plain;
      },
    }),
  ).not.toThrow();
  expect(inspected).toEqual(["entry", "data", "data", "windows"]);
});

test("a missing root reference does not prevent validating the Windows override", () => {
  /** @type {string[]} */
  const inspected = [];
  const input = fileWith([
    {
      type: "command",
      command: "cat /etc/motd",
      commandWindows: '"${CLAUDE_PLUGIN_ROOT}/windows"',
    },
  ]);
  expect(() =>
    validateHooks(input, {
      statOf: (path) => {
        inspected.push(path);
        return null;
      },
    }),
  ).toThrow(
    new Error(
      "hooks/hooks.json:\n  Start: command does not reference ${CLAUDE_PLUGIN_ROOT}: cat /etc/motd\n  Start: windows does not exist in the plugin",
    ),
  );
  expect(inspected).toEqual(["windows"]);
});

test("a filesystem failure propagates unchanged before later references", () => {
  /** @type {string[]} */
  const inspected = [];
  const failure = new Error("filesystem unavailable");
  const input = fileWith([
    {
      type: "command",
      command: '"${CLAUDE_PLUGIN_ROOT}/first" "${CLAUDE_PLUGIN_ROOT}/later"',
    },
  ]);
  /** @type {unknown} */
  let thrown;
  try {
    validateHooks(input, {
      statOf: (path) => {
        inspected.push(path);
        throw failure;
      },
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(failure);
  expect(inspected).toEqual(["first"]);
});
