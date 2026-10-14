import { spawnSync } from "node:child_process";

/** @param {readonly string[]} args */
export function runPnpm(args, options = {}) {
  let result = spawnSync("pnpm", args, { encoding: "utf8", ...options });
  // pnpm's bootstrap can be a shebang-less POSIX script until its native
  // binary is installed. Pass arguments without shell interpolation.
  if (result.error?.code === "ENOEXEC" && process.platform !== "win32") {
    result = spawnSync("sh", ["-c", 'exec pnpm "$@"', "pnpm", ...args], {
      encoding: "utf8",
      ...options,
    });
  }
  return result;
}
