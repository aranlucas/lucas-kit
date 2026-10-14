import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { NO_READ_PERMISSION, UNREADABLE } from "../session-hook-sheets.mjs";
import { agentEntry, fakeCtx, fakePi, recordWith, useWorld } from "./harness.mjs";

/** @returns {import("../../plugins/pstack/pi/agents.ts").AgentRecord} */
function runningRecord() {
  return {
    agent: {
      id: "fixture-agent",
      description: "original",
      subagentType: "general-purpose",
      sessionId: "fixture-session",
      sessionDir: "/fixture/session",
      cwd: "/fixture/work",
      startedAt: "2026-01-01T00:00:00.000Z",
      model: undefined,
      worktree: { repo: "/fixture/repo", path: "/fixture/tree", branch: "fixture", base: "main" },
    },
    status: "running",
    parentPid: 42,
    pid: undefined,
    pidStart: undefined,
  };
}

/** @param {unknown} [message] @returns {import("./harness.mjs").CapturedLaunchFailure} */
function launchFailure(message) {
  return {
    agent: runningRecord().agent,
    status: "failed",
    exitCode: null,
    endedAt: "2026-01-01T00:01:00.000Z",
    finalText: message,
  };
}

/** @returns {import("./harness.mjs").PstackNotice} */
function notice() {
  return {
    customType: "pstack-agent",
    content: "finished",
    display: true,
    details: { agentId: "fixture-agent", status: "completed", exitCode: 0, outputFile: undefined },
  };
}

const setup = useWorld();

describe("fake Pi capture contracts", () => {
  test("persisted captures are detached JSON clones with undefined fields omitted", () => {
    const pi = fakePi();
    const record = runningRecord();
    expect(pi.api.appendEntry("pstack-agents", record)).toBe(1);
    const [entry] = pi.entries;

    expect(entry).toEqual({
      type: "custom",
      customType: "pstack-agents",
      data: {
        agent: {
          id: "fixture-agent",
          description: "original",
          subagentType: "general-purpose",
          sessionId: "fixture-session",
          sessionDir: "/fixture/session",
          cwd: "/fixture/work",
          startedAt: "2026-01-01T00:00:00.000Z",
          worktree: {
            repo: "/fixture/repo",
            path: "/fixture/tree",
            branch: "fixture",
            base: "main",
          },
        },
        status: "running",
        parentPid: 42,
      },
    });
    expect(entry.data).not.toBe(record);
    expect(entry.data.agent).not.toBe(record.agent);
    expect(entry.data.agent.worktree).not.toBe(record.agent.worktree);
    expect(Object.hasOwn(entry.data, "pid")).toBe(false);
    expect(Object.hasOwn(entry.data.agent, "model")).toBe(false);
    expect(Object.hasOwn(record, "pid")).toBe(true);
    record.agent.description = "changed after append";
    expect(entry.data.agent.description).toBe("original");
    entry.data.agent.description = "changed in capture";
    expect(record.agent.description).toBe("changed after append");
  });

  test("captures retain running and ended records without inventing completion fields", () => {
    const pi = fakePi();
    const running = runningRecord();
    pi.api.appendEntry("pstack-agents", running);
    pi.api.appendEntry("pstack-agents", {
      agent: running.agent,
      status: "stopped",
      exitCode: null,
      endedAt: "2026-01-01T00:01:00.000Z",
      finalText: "stopped",
      outputFile: undefined,
    });

    expect(pi.entries.map(({ data }) => data.status)).toEqual(["running", "stopped"]);
    expect(Object.hasOwn(pi.entries[0].data, "exitCode")).toBe(false);
    expect(pi.entries[1].data).toMatchObject({ exitCode: null, finalText: "stopped" });
    expect(Object.hasOwn(pi.entries[1].data, "outputFile")).toBe(false);
  });

  test("a failed launch's undefined message is omitted from the JSON capture", () => {
    const pi = fakePi();
    const failed = launchFailure();
    pi.api.appendEntry("pstack-agents", failed);
    const [entry] = pi.entries;

    expect(Object.hasOwn(failed, "finalText")).toBe(true);
    expect(Object.hasOwn(entry.data, "finalText")).toBe(false);
    expect(entry.data).toMatchObject({ status: "failed", exitCode: null });
    expect(entry.data.agent.id).toBe(failed.agent.id);
    expect(entry.data.agent).not.toBe(failed.agent);
  });

  test("a failed launch's numeric message remains a number in the JSON capture", () => {
    const pi = fakePi();
    const failed = launchFailure(37);
    pi.api.appendEntry("pstack-agents", failed);

    expect(pi.entries[0].data).toMatchObject({ status: "failed", exitCode: null, finalText: 37 });
    expect(failed.finalText).toBe(37);
  });

  test("a failed launch's object message is JSON-cloned without string normalization", () => {
    const pi = fakePi();
    const message = { detail: "original", omitted: undefined };
    const failed = launchFailure(message);
    pi.api.appendEntry("pstack-agents", failed);

    expect(pi.entries[0].data).toMatchObject({
      status: "failed",
      exitCode: null,
      finalText: { detail: "original" },
    });
    expect(failed.finalText).toBe(message);
    message.detail = "changed after capture";
    expect(pi.entries[0].data).toMatchObject({ finalText: { detail: "original" } });
  });

  test("JSON serialization evaluates getters before capture and preserves thrown errors", () => {
    const pi = fakePi();
    const record = runningRecord();
    const failure = new Error("fixture getter failed");
    let reads = 0;
    Object.defineProperty(record.agent, "description", {
      enumerable: true,
      get() {
        reads++;
        expect(pi.entries).toEqual([]);
        throw failure;
      },
    });

    expect(() => pi.api.appendEntry("pstack-agents", record)).toThrow(failure);
    expect(reads).toBe(1);
    expect(pi.entries).toEqual([]);
  });

  test("notices and both delivery options remain the original objects", () => {
    const pi = fakePi();
    const message = notice();
    /** @type {import("./harness.mjs").NoticeOptions} */
    const steer = { triggerTurn: true, deliverAs: "steer" };
    /** @type {import("./harness.mjs").NoticeOptions} */
    const stopped = { triggerTurn: false };
    expect(pi.api.sendMessage(message, steer)).toBe(1);
    expect(pi.api.sendMessage(message, stopped)).toBe(2);

    expect(pi.messages[0].message).toBe(message);
    expect(pi.messages[0].options).toBe(steer);
    expect(pi.messages[1].message).toBe(message);
    expect(pi.messages[1].options).toBe(stopped);
    expect(Object.hasOwn(pi.messages[1].options, "deliverAs")).toBe(false);
    message.content = "updated in place";
    expect(pi.messages[0].message.content).toBe("updated in place");
    expect(Object.hasOwn(pi.messages[0].message.details, "outputFile")).toBe(true);
  });

  test("follow-up options retain their identity and template-expansion flag", () => {
    const pi = fakePi();
    /** @type {import("./harness.mjs").UserMessageOptions} */
    const options = { deliverAs: "followUp", expandPromptTemplates: true };
    expect(pi.api.sendUserMessage("/loop fixture", options)).toBe(1);
    expect(pi.userMessages).toEqual([{ content: "/loop fixture", options }]);
    expect(pi.userMessages[0].options).toBe(options);
  });

  test("restored fixture entries and replacement records remain unchecked candidates", () => {
    const record = runningRecord();
    const replacement = { agent: { id: 7 }, status: "not-a-status", exitCode: "0" };
    const candidate = recordWith(record, replacement);
    expect(candidate).toMatchObject(replacement);
    expect(candidate).not.toBe(record);
    expect(record.agent.id).toBe("fixture-agent");
    expect(record.status).toBe("running");
    expect(agentEntry(candidate).data).toBe(candidate);
    expect(agentEntry(null).data).toBeNull();
    expect(agentEntry("malformed").data).toBe("malformed");
  });
});

describe("fake context and world contracts", () => {
  test("empty and select-only UIs retain identity without injected methods", async () => {
    const empty = {};

    const selectOnly = {
      /** @param {string} _title @param {string[]} choices */
      select: (_title, choices) => Promise.resolve(choices[0]),
    };

    expect(fakeCtx({ ui: empty }).ui).toBe(empty);
    const ctx = fakeCtx({ hasUI: true, ui: selectOnly });
    expect(ctx.ui).toBe(selectOnly);
    expect(Object.keys(ctx.ui)).toEqual(["select"]);
    expect(await selectOnly.select("fixture", ["first", "second"])).toBe("first");
    expect(fakeCtx().ui).toHaveProperty("notify");
  });

  test("null models and asynchronous auth checks preserve every fixture auth mode", async () => {
    await Promise.all(
      ["configured", "none", "live-check-only"].map(async (auth) => {
        const ctx = fakeCtx({ model: null, auth });
        expect(ctx.model).toBeNull();
        expect(ctx.modelRegistry.hasConfiguredAuth()).toBe(auth === "configured");
        const available = ctx.modelRegistry.getAvailableOfType();
        expect(available).toBeInstanceOf(Promise);
        expect(await available).toEqual(auth === "none" ? [] : [null]);
      }),
    );
    const model = { provider: "fixture", id: "chosen-model" };
    const ctx = fakeCtx({ model, auth: "live-check-only" });
    expect(ctx.model).toBe(model);
    expect((await ctx.modelRegistry.getAvailableOfType())[0]).toBe(model);
  });

  test("entries and dynamic idle/pending callbacks retain their original behavior", () => {
    const entries = [agentEntry(null), "malformed"];
    let idle = false;
    let pending = true;

    const ctx = fakeCtx({
      cwd: "/fixture",
      entries,
      idle: () => idle,
      pending: () => pending,
      mode: "rpc",
    });

    expect(ctx.sessionManager.getEntries()).toBe(entries);
    expect(ctx.cwd).toBe("/fixture");
    expect(ctx.mode).toBe("rpc");
    expect(ctx.isIdle()).toBe(false);
    expect(ctx.hasPendingMessages()).toBe(true);
    idle = true;
    pending = false;
    expect(ctx.isIdle()).toBe(true);
    expect(ctx.hasPendingMessages()).toBe(false);
    expect(fakeCtx({ idle: false }).isIdle()).toBe(false);
  });

  test("setup preserves the world's own settings and context override order", () => {
    const piSettings = { command: "fixture-only", args: ["argument"] };
    const ui = {};

    const { w, ctx } = setup({
      settings: { pi: piSettings, killGraceMs: 0 },
      ctx: { cwd: "/override", model: null, ui },
    });

    expect(w.settings.pi).not.toBe(piSettings);
    expect(w.settings.killGraceMs).toBe(300);
    expect(ctx.cwd).toBe("/override");
    expect(ctx.model).toBeNull();
    expect(ctx.ui).toBe(ui);
  });

  test("script inputs remain unvalidated and sheet buffers retain their bytes", () => {
    const script = { default: [null, "malformed", { stdout: 7 }] };
    const sheet = Buffer.from("\uFEFFsession hook: off\r\n", "utf16le");
    const { w } = setup({ script, sheet });
    expect(readFileSync(w.settings.pi.args[0], "utf8")).toBe(JSON.stringify(script));
    expect(readFileSync(join(w.agentDir, "pstack-models.md"))).toEqual(sheet);
  });

  test("null sheet input leaves the sheet absent", () => {
    const { w } = setup({ sheet: null });
    expect(existsSync(join(w.agentDir, "pstack-models.md"))).toBe(false);
  });

  test("the unreadable symbol still creates a directory in place of the sheet", () => {
    const { w } = setup({ sheet: UNREADABLE });
    expect(statSync(join(w.agentDir, "pstack-models.md")).isDirectory()).toBe(true);
  });

  test.skipIf(process.platform === "win32")(
    "the no-read-permission symbol still writes the off sheet with no permissions",
    () => {
      const { w } = setup({ sheet: NO_READ_PERMISSION });
      expect(statSync(join(w.agentDir, "pstack-models.md")).mode & 0o777).toBe(0);
    },
  );
});
