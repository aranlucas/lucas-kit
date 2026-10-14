import { expect, test } from "vitest";

import { isForegroundWait } from "../../plugins/pstack/pi/sleep-wait.ts";

test.each([
  ["1", "2"],
  ["1s", "2s"],
  ["0.02m", "0.04m"],
  ["0.0003h", "0.001h"],
  ["0.00001d", "0.0001d"],
])("the finite unit table keeps %s below and %s above two seconds", (short, long) => {
  expect(isForegroundWait(`sleep ${short}`)).toBe(false);
  expect(isForegroundWait(`sleep ${long}`)).toBe(true);
});

test.each(["2S", "2M", "2H", "2D", "2constructor", "2__proto__"])(
  "the duration parser rejects the unsupported unit in %s",
  (duration) => {
    expect(isForegroundWait(`sleep ${duration}`)).toBe(false);
  },
);
