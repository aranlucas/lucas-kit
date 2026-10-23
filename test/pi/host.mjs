// A print-mode parent in its own process, so a test can end it the way pi can
// end abruptly: process.exit (pi's uncaught-crash path) or a Ctrl-C SIGINT.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { install } from "../../plugins/pstack/pi/index.ts";
import { fakeCtx, fakePi, sleep } from "./harness.mjs";

const [settingsJson, how] = process.argv.slice(2);
// The parent passes its typed settings directly as JSON.
const settings = /** @type {import("../../plugins/pstack/pi/config.ts").Settings} */ (
  JSON.parse(settingsJson)
);
const [, log] = settings.pi.args;
const pi = fakePi();
install(pi.api, settings);
const ctx = fakeCtx({ cwd: join(dirname(log), "work"), mode: "print" });
await pi.emit("session_start", { reason: "startup" }, ctx);
await pi.call("agent", { description: "bg", prompt: "x", run_in_background: true }, ctx);
// What a second pi process opening the same session would read.
console.log(JSON.stringify(pi.entries));

// oxlint-disable-next-line eslint/no-await-in-loop -- Cases share fixture state or ordered assertions; finish each before starting the next.
while (!(existsSync(log) && readFileSync(log, "utf8").includes('"grandchild"'))) await sleep(20);
if (how === "exit") process.exit(1);
setInterval(() => {}, 1000);
