import { assert, describe, expect, test } from "vitest";

import { fakeCtx, fakePi } from "@test/pi/harness.mjs";

/** @typedef {import("./harness.mjs").FixtureCommand} FixtureCommand */
/** @typedef {import("./harness.mjs").FakeCtx} FakeCtx */

describe("fake Pi command registry", () => {
  test("registration returns the real Map and keeps the command and handler identities", async () => {
    const pi = fakePi();
    const ctx = fakeCtx();
    const pending = Promise.resolve();
    /** @type {{ args: string, ctx: FakeCtx, receiver: FixtureCommand }[]} */
    const calls = [];

    /** @type {FixtureCommand} */
    const options = {
      description: "original",
      handler(args, context) {
        calls.push({ args, ctx: context, receiver: this });

        return pending;
      },
    };

    expect(pi.api.registerCommand("fixture", options)).toBe(pi.commands);
    expect(pi.commands.get("fixture")).toBe(options);
    expect(calls).toEqual([]);
    options.description = "updated";
    const command = pi.commands.get("fixture");
    assert.ok(command);
    expect(command.description).toBe("updated");
    expect(command.handler).toBe(options.handler);
    const result = command.handler("arguments", ctx);
    expect(result).toBe(pending);
    expect(calls).toEqual([{ args: "arguments", ctx, receiver: options }]);
    await result;
  });

  test("replacement and deletion preserve Map order while command listings are fresh snapshots", () => {
    const pi = fakePi();
    const first = { description: "first", handler: () => Promise.resolve() };
    const second = { description: "second", handler: () => Promise.resolve() };
    const replacement = { description: "replacement", handler: () => Promise.resolve() };
    pi.api.registerCommand("first", first);
    pi.api.registerCommand("second", second);
    expect(pi.api.registerCommand("first", replacement)).toBe(pi.commands);
    expect(pi.commands.get("first")).toBe(replacement);
    const listing = pi.api.getCommands();
    expect(listing).toEqual([
      { name: "first", source: "extension" },
      { name: "second", source: "extension" },
    ]);
    expect(pi.api.getCommands()).not.toBe(listing);
    expect(pi.api.getCommands()[0]).not.toBe(listing[0]);
    listing[0].name = "only the snapshot";
    expect(pi.api.getCommands()[0].name).toBe("first");
    expect(pi.commands.get("missing")).toBeUndefined();
    expect(pi.commands.delete("first")).toBe(true);
    expect(pi.commands.get("first")).toBeUndefined();
    expect(pi.api.getCommands()).toEqual([{ name: "second", source: "extension" }]);
  });

  test("handler rejection values and getter errors pass through without conversion", async () => {
    const pi = fakePi();
    const rejected = new Error("original message");
    Object.defineProperty(rejected, "message", { value: 37 });
    const getterFailure = new Error("handler getter failed");
    const options = { description: "rejection", handler: () => Promise.reject(rejected) };
    pi.api.registerCommand("fixture", options);
    const command = pi.commands.get("fixture");
    assert.ok(command);
    await expect(command.handler("arguments", fakeCtx())).rejects.toBe(rejected);
    expect(rejected).toHaveProperty("message", 37);
    Object.defineProperty(options, "handler", {
      get() {
        throw getterFailure;
      },
    });
    expect(() => command.handler("arguments", fakeCtx())).toThrow(getterFailure);
  });
});
