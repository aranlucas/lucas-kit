import { afterEach, assert, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { findSessionFile, PiRpc } from "@test/pi/live-harness.mjs";

/** @typedef {import("./live-harness.mjs").PiRpcOptions} PiRpcOptions */

/** @type {string[]} */
const temporaryDirectories = [];

/** @type {(() => Promise<void>)[]} */
const cleanups = [];

let executableDirectory = "";

/** @param {PiRpcOptions} [options] */
function rpcFixture(options) {
  const rpc = new PiRpc(options ?? { model: "fixture/model" });
  const child = rpc.proc;
  const kill = child.kill.bind(child);

  /** @type {Promise<void>} */
  const exited = new Promise((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });

  cleanups.push(() => {
    kill("SIGKILL");

    return exited;
  });

  return { child, rpc };
}

beforeEach(() => {
  executableDirectory = mkdtempSync(join(tmpdir(), "pstack-pi-process-fixture-"));
  temporaryDirectories.push(executableDirectory);
  // The absolute Node shebang and exclusive PATH cannot select an installed Pi.
  // This fixture only records its own argv/cwd and one synthetic env value.
  writeFileSync(
    join(executableDirectory, "pi"),
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
fs.writeFileSync(path.join(path.dirname(process.argv[1]), "startup.json"), JSON.stringify({
  argv: process.argv.slice(2), cwd: process.cwd(), fixture: process.env.FIXTURE_ONLY,
}));
process.stdout.write(JSON.stringify({ type: "fixture_started" }) + "\\n");
process.stdin.resume();
setInterval(() => {}, 2 ** 30);
`,
    { mode: 0o700 },
  );
  vi.stubEnv("PATH", executableDirectory);
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(async () => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  vi.restoreAllMocks();

  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PiRpc process scaffolding without Pi", () => {
  test("constructor forwards argv, URL cwd and env values to an isolated fake executable", async () => {
    const cwd = pathToFileURL(executableDirectory);
    const env = { PATH: executableDirectory, FIXTURE_ONLY: "yes" };
    const { child } = rpcFixture({ cwd, env, model: "provider/model", thinking: "high" });
    expect(child.spawnargs).toEqual([
      "pi",
      "--mode",
      "rpc",
      "--model",
      "provider/model",
      "--thinking",
      "high",
    ]);
    await new Promise((resolve) => {
      child.stdout.once("data", resolve);
    });
    /** @type {unknown} */
    const startup = JSON.parse(readFileSync(join(executableDirectory, "startup.json"), "utf8"));
    expect(startup).toEqual({
      argv: ["--mode", "rpc", "--model", "provider/model", "--thinking", "high"],
      cwd: executableDirectory,
      fixture: "yes",
    });
    expect(child.stdout.listenerCount("data")).toBe(1);
    expect(child.stderr.listenerCount("data")).toBe(1);
    expect(child.listenerCount("close")).toBe(1);
  });

  test("constructor preserves default thinking with absent cwd/env options", () => {
    const { child } = rpcFixture();
    expect(child.spawnargs).toEqual([
      "pi",
      "--mode",
      "rpc",
      "--model",
      "fixture/model",
      "--thinking",
      "low",
    ]);
  });

  test.each([0, 7, null])(
    "exited resolves the first close argument %s and ignores its signal",
    async (code) => {
      const { child, rpc } = rpcFixture();
      child.emit("close", code, "SIGTERM");
      await expect(rpc.exited).resolves.toBe(code);
    },
  );

  test("stderr keeps per-chunk coercion, including split multibyte buffers", () => {
    const { child, rpc } = rpcFixture();
    child.stderr.emit("data", Buffer.from([0xe2]));
    child.stderr.emit("data", Buffer.from([0x82, 0xac]));
    child.stderr.emit("data", "tail");
    expect(rpc.stderr).toBe("���tail");
  });

  test("constructor option getter errors retain their original identity", () => {
    const failure = new Error("fixture option failure");

    const options = {
      /** @returns {never} */
      get model() {
        throw failure;
      },
    };

    expect(() => new PiRpc(options)).toThrow(failure);
  });

  test("command fields keep spread order and the pending response exists before the write", async () => {
    const { child, rpc } = rpcFixture();
    const responseData = { value: "fixture response" };

    const write = vi.spyOn(child.stdin, "write").mockImplementation(() => {
      child.stdout.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            type: "response",
            id: "c1",
            success: true,
            data: responseData,
          })}\n`,
        ),
      );

      return true;
    });

    const result = rpc.command("original", { id: "overridden", type: 37, omitted: undefined });
    expect(write).toHaveBeenCalledExactlyOnceWith('{"id":"overridden","type":37}\n');
    expect(rpc.pending.size).toBe(0);
    await expect(result).resolves.toEqual(responseData);
  });

  test("a command serialization failure leaves its registered pending entry and performs no write", async () => {
    const { child, rpc } = rpcFixture();
    const write = vi.spyOn(child.stdin, "write");
    await expect(rpc.command("unserializable", { value: 1n })).rejects.toBeInstanceOf(TypeError);
    expect(rpc.nextId).toBe(1);
    expect(rpc.pending.has("c1")).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  test("close ends stdin before waiting and leaves its losing timer scheduled", async () => {
    const { child, rpc } = rpcFixture();
    const kill = vi.spyOn(child, "kill").mockReturnValue(true);
    const closed = rpc.close();
    expect(child.stdin.writableEnded).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    child.emit("close", 0, null);
    await closed;
    expect(kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("close kills at twenty seconds and resolves without waiting for post-kill exit", async () => {
    const { child, rpc } = rpcFixture();
    let exited = false;

    const exitObserved = rpc.exited.then(() => {
      exited = true;

      return exited;
    });

    const kill = vi.spyOn(child, "kill").mockReturnValue(true);
    const closed = rpc.close();
    expect(child.stdin.writableEnded).toBe(true);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await closed;
    expect(kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(exited).toBe(false);
    child.emit("close", null, "SIGKILL");
    await exitObserved;
    expect(exited).toBe(true);
  });
});

describe("PiRpc synchronous polling contract", () => {
  test("a truthy result is inspected synchronously and returned by identity", async () => {
    const { rpc } = rpcFixture();
    const value = { ready: true };
    const predicate = vi.fn(() => value);
    const result = rpc.until(predicate, -1, "already ready");
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(result).resolves.toBe(value);
  });

  test.each([false, null, undefined])(
    "a truthy Promise resolving %s is assimilated without another poll",
    async (value) => {
      const { rpc } = rpcFixture();
      const predicate = vi.fn(() => Promise.resolve(value));
      const result = rpc.until(predicate, -1, "thenable");
      expect(predicate).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      await expect(result).resolves.toBe(value);
      expect(predicate).toHaveBeenCalledTimes(1);
    },
  );

  test("false results wait 250 milliseconds before polling again", async () => {
    const { rpc } = rpcFixture();
    const value = { ready: true };

    const predicate = vi
      .fn(/** @returns {false | typeof value} */ () => value)
      .mockReturnValueOnce(false);

    const result = rpc.until(predicate, 1000, "ready");
    expect(predicate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(predicate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(value);
    expect(predicate).toHaveBeenCalledTimes(2);
  });

  test("the deadline is strict and timeout errors retain the final 800 stderr characters", async () => {
    const { rpc } = rpcFixture();
    rpc.stderr = `omitted:${"z".repeat(800)}`;
    const predicate = vi.fn(() => false);
    const result = rpc.until(predicate, 0, "fixture completion");
    const outcome = result.catch(/** @param {unknown} error */ (error) => error);
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(250);
    /** @type {unknown} */
    const error = await outcome;
    assert.ok(error instanceof Error);
    expect(error.message).toBe(
      `timed out waiting for fixture completion. stderr: ${"z".repeat(800)}`,
    );
    expect(predicate).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("synchronous predicate throws and rejected thenables retain error identity", async () => {
    const { rpc } = rpcFixture();
    const failure = new Error("predicate failed");
    await expect(
      rpc.until(
        () => {
          throw failure;
        },
        1000,
        "throw",
      ),
    ).rejects.toBe(failure);
    await expect(rpc.until(() => Promise.reject(failure), 1000, "rejection")).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("session path scaffolding", () => {
  test("recursive lookup preserves its exact suffix and one-result requirement", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-live-scaffold-"));
    temporaryDirectories.push(root);
    const nested = join(root, "nested");
    mkdirSync(nested);
    writeFileSync(join(root, "prefix_target.jsonl.bak"), "");
    writeFileSync(join(root, "prefix_not-target.jsonl"), "");
    expect(() => findSessionFile(root, "target")).toThrow();
    const target = join(nested, "prefix_target.jsonl");
    writeFileSync(target, "");
    expect(findSessionFile(root, "target")).toBe(target);
    writeFileSync(join(root, "second_target.jsonl"), "");
    expect(() => findSessionFile(root, "target")).toThrow();
  });
});
