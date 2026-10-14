// A minimal stand-in for Pi's ExtensionAPI and ExtensionContext that records
// what the extension registers and sends, plus per-test fixtures over the fake
// pi. What only the real-pi suite needs is in live-harness.mjs.
import { afterEach } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { install } from "../../plugins/pstack/pi/index.ts";
import { writeSheet } from "../session-hook-sheets.mjs";

/** @typedef {import("../../plugins/pstack/pi/agents.ts").AgentRecord} AgentRecord */
/** @typedef {import("../../plugins/pstack/pi/agents.ts").EndedRecord} EndedRecord */
/**
 * launch's catch persists the unchecked caught .message before rethrowing.
 * Its JSON clone may omit finalText or retain a non-string value.
 * @typedef {Omit<EndedRecord, "status" | "exitCode" | "finalText"> & { status: "failed", exitCode: null, finalText?: unknown }} CapturedLaunchFailure
 * @typedef {AgentRecord | CapturedLaunchFailure} CapturedAgentRecord
 */
/** @typedef {import("../../plugins/pstack/pi/config.ts").Settings} Settings */
/** @typedef {ReturnType<typeof world>} World */
/** @typedef {ReturnType<typeof fakePi>} FakePi */
/** @typedef {ReturnType<typeof fakeCtx>} FakeCtx */
/** @typedef {import("../session-hook-sheets.mjs").SheetInput} SheetInput */
/** @typedef {{ script?: unknown, sheet?: SheetInput }} WorldOptions */
/** @typedef {{ signal?: AbortSignal }} DialogOptions */
/**
 * Only the UI methods fixtures supply; empty and select-only UIs are intentional.
 * @typedef {object} FixtureUI
 * @property {(title: string, options: string[], dialog?: DialogOptions) => Promise<string | undefined>} [select]
 * @property {(title: string, placeholder?: string, dialog?: DialogOptions) => Promise<string | undefined>} [input]
 * @property {(message: string, kind?: string) => void} [notify]
 * @property {(title: string, message: string, dialog?: DialogOptions) => Promise<boolean>} [confirm]
 */
/**
 * @typedef {object} FakeCtxOptions
 * @property {string} [cwd]
 * @property {unknown[]} [entries]
 * @property {{ provider: string, id: string } | null} [model]
 * @property {string} [mode]
 * @property {boolean} [hasUI]
 * @property {FixtureUI} [ui]
 * @property {boolean | (() => boolean)} [idle]
 * @property {() => boolean} [pending]
 * @property {string} [auth]
 */
/**
 * Captures the first-party producers in AgentRunner.persist/finish, noticeOf,
 * and Scheduler.fire, rather than claiming to implement Pi's complete API.
 * @typedef {{ type: "custom", customType: "pstack-agents", data: CapturedAgentRecord }} CapturedEntry
 * @typedef {{ customType: "pstack-agent", content: string, display: true, details: { agentId: string, status: "completed" | "failed" | "stopped", exitCode: number | null, outputFile: string | undefined } }} PstackNotice
 * @typedef {{ triggerTurn: true, deliverAs: "steer" } | { triggerTurn: false }} NoticeOptions
 * @typedef {{ deliverAs: "followUp", expandPromptTemplates: true }} UserMessageOptions
 */

export const pluginRoot = fileURLToPath(new URL("../../plugins/pstack/", import.meta.url));
const fakePiBin = fileURLToPath(new URL("./fake-pi.mjs", import.meta.url));

const fixtureModels = {
  available: ["opus", "fable", "sonnet", "haiku"],
  efforts: ["low", "medium", "high", "xhigh", "max"],
  pi: {
    fallback: "anthropic",
    models: {
      anthropic: {
        opus: "anthropic/fixture-opus",
        fable: "anthropic/fixture-fable",
        sonnet: "anthropic/fixture-sonnet",
        haiku: "anthropic/fixture-haiku",
      },
      "openai-codex": {
        opus: "openai-codex/fixture-opus",
        fable: "openai-codex/fixture-fable",
        sonnet: "openai-codex/fixture-sonnet",
        haiku: "openai-codex/fixture-haiku",
      },
    },
  },
};

export function fakePi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  /** @type {{ message: PstackNotice, options: NoticeOptions }[]} */
  const messages = [];
  /** @type {{ content: string, options: UserMessageOptions }[]} */
  const userMessages = [];
  /** @type {CapturedEntry[]} */
  const entries = [];
  const api = {
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, options) => commands.set(name, options),
    getCommands: () => [...commands.keys()].map((name) => ({ name, source: "extension" })),
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
    /** @type {(message: PstackNotice, options: NoticeOptions) => void} */
    sendMessage: (message, options) => messages.push({ message, options }),
    /** @type {(content: string, options: UserMessageOptions) => void} */
    sendUserMessage: (content, options) => userMessages.push({ content, options }),
    getThinkingLevel: () => "medium",
    /** @type {(customType: "pstack-agents", data: CapturedAgentRecord) => void} */
    appendEntry: (customType, data) =>
      // SAFETY: first-party producers construct the record and identity fields.
      // launch's unchecked caught message remains unknown in the capture type;
      // JSON may omit finalText or throw; there is no extra validation here.
      entries.push({ type: "custom", customType, data: /** @type {CapturedAgentRecord} */ (JSON.parse(JSON.stringify(data))) }),
  };
  return {
    api,
    tools,
    commands,
    messages,
    userMessages,
    entries,
    async emit(event, payload, ctx) {
      const results = [];
      for (const h of handlers.get(event) ?? []) results.push(await h({ type: event, ...payload }, ctx));
      return results;
    },
    call(name, params, ctx, signal) {
      return tools.get(name).execute("call-1", params, signal, undefined, ctx);
    },
  };
}

/** @param {FakeCtxOptions} [options] */
export function fakeCtx({ cwd, entries = [], model = { provider: "anthropic", id: "parent-model" }, mode = "tui", hasUI = false, ui = { notify() {} }, idle = true, pending = () => false, auth = "configured" } = {}) {
  return {
    cwd,
    mode,
    hasUI,
    ui,
    model,
    modelRegistry: {
      hasConfiguredAuth: () => auth === "configured",
      getAvailableOfType: async () => (auth === "none" ? [] : [model]),
    },
    isIdle: () => (typeof idle === "function" ? idle() : idle),
    hasPendingMessages: pending,
    sessionManager: { getSessionId: () => "parent-session", getEntries: () => entries },
  };
}

// A temp world: agent dir, a fixture models.json, a fake-pi script and log.
/** @param {WorldOptions} [options] */
export function world({ script = {}, sheet = null } = {}) {
  // realpath: macOS's tmpdir is a symlink, and git and the child report real paths.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pstack-pi-")));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir);
  if (sheet !== null) writeSheet(join(agentDir, "pstack-models.md"), sheet);
  const modelsFile = join(root, "models.json");
  writeFileSync(modelsFile, JSON.stringify(fixtureModels));
  const scriptFile = join(root, "script.json");
  writeFileSync(scriptFile, JSON.stringify(script));
  const logFile = join(root, "fake-pi.log");
  const cwd = join(root, "work");
  mkdirSync(cwd);
  /** @type {Settings} */
  const settings = {
    pluginRoot,
    modelsFile,
    agentDir,
    pi: { command: fakePiBin, args: [scriptFile, logFile] },
    depth: 0,
    killGraceMs: 300,
    exitGraceMs: 1500,
  };
  /** @type {(number | undefined)[]} */
  const strays = [];
  return {
    agentDir,
    cwd,
    settings,
    log: () => (existsSync(logFile) ? readEntries(logFile) : []),
    /** @param {string} kind */
    logged(kind) {
      return this.log().filter((r) => r.kind === kind);
    },
    /** @param {string} kind @param {number} [n] */
    until(kind, n = 1) {
      return waitFor(() => this.logged(kind).length >= n);
    },
    invocations() {
      return this.logged("invocation");
    },
    // A process the test itself starts; cleanup ends it.
    /** @param {string} command @param {readonly string[]} args @param {import("node:child_process").SpawnOptions} [options] */
    spawn(command, args, options) {
      const proc = spawn(command, args, { stdio: "ignore", ...options });
      strays.push(proc.pid);
      return proc;
    },
    // Ends every process the fake logged or the test spawned, with its group,
    // so a test that fails midway leaves nothing running. `pids` adds the
    // children the extension recorded, for one that has not logged yet.
    /** @param {(number | undefined)[]} [pids] */
    cleanup(pids = []) {
      for (const pid of new Set([...strays, ...pids, ...this.log().map((r) => r.pid)])) {
        // Zero or a negative pid would signal this process's own group.
        if (!Number.isInteger(pid) || pid <= 1) continue;
        for (const target of [-pid, pid]) {
          try {
            process.kill(target, "SIGKILL");
          } catch {}
        }
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// One per test file: registers the cleanup and returns the setup function.
/** @returns {(options?: WorldOptions & { settings?: Partial<Settings>, ctx?: FakeCtxOptions }) => { w: World, pi: FakePi, ctx: FakeCtx }} */
export function useWorld() {
  /** @type {World | undefined} */
  let w;
  /** @type {FakePi} */
  let pi;
  afterEach(() => w?.cleanup(pi.entries.map((e) => e.data?.pid)));
  return ({ script, sheet, settings = {}, ctx = {} } = {}) => {
    w = world({ script, sheet });
    pi = fakePi();
    install(pi.api, { ...w.settings, ...settings });
    return { w, pi, ctx: fakeCtx({ cwd: w.cwd, ...ctx }) };
  };
}

// A second extension instance over the same world, as after a reload or resume.
/** @param {World} w @param {unknown[]} entries @param {string} [reason] */
export async function restore(w, entries, reason = "resume") {
  const pi = fakePi();
  install(pi.api, w.settings);
  await pi.emit("session_start", { reason }, fakeCtx({ cwd: w.cwd, entries }));
  return pi;
}

export const resultText = (result) => result.content.map((c) => c.text).join("");

/** @param {FakePi} pi @param {FakeCtx} ctx */
export const listAgents = async (pi, ctx) => JSON.parse(resultText(await pi.call("list_agents", {}, ctx)));

/** @template T @param {T} data */
export const agentEntry = (data) => ({ type: "custom", customType: "pstack-agents", data });

// A persisted record with fields replaced: identity ones under `agent`, the rest beside it.
// Replacements deliberately include malformed values; restore must validate the candidate.
/** @param {CapturedAgentRecord} data @param {Record<string, unknown> & { agent?: Record<string, unknown> }} [replacement] @returns {Record<string, unknown>} */
export const recordWith = (data, { agent = {}, ...state } = {}) => ({ ...data, ...state, agent: { ...data.agent, ...agent } });

// An agent file's body, which is what its child gets as a system prompt.
/** @param {string} rel */
export const agentBody = (rel) => /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(readFileSync(join(pluginRoot, rel), "utf8"))[1].trim();

// The value an invocation's argv gives a flag, or null without the flag.
export const flag = (inv, name) => (inv.argv.includes(name) ? inv.argv[inv.argv.indexOf(name) + 1] : null);

/** @param {string} dir */
export function gitRepo(dir) {
  /** @param {...string} args */
  const run = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  run("init", "-q", "-b", "main");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "t");
  writeFileSync(join(dir, "README"), "x\n");
  run("add", "README");
  run("commit", "-q", "-m", "init");
  return run;
}

// The default stays under Vitest's configured 5 s test timeout, so this error is the one reported.
/** @param {() => unknown} predicate @param {number} [timeoutMs] */
export async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms: ${predicate}`);
    await sleep(20);
  }
}

// EPERM means the process exists but belongs to another user.
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const readEntries = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
