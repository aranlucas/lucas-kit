import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const scriptsDirectory = import.meta.dirname;
const nodeModulesDirectory = join(scriptsDirectory, "node_modules");
const commanderPackagePath = join(
  nodeModulesDirectory,
  "commander",
  "package.json"
);
const installKeyPath = join(
  nodeModulesDirectory,
  ".poteto-mode-tools-install-key"
);

function currentInstallKey(): string {
  return createHash("sha256")
    .update(readFileSync(join(scriptsDirectory, "package.json")))
    .update("\0")
    .update(readFileSync(join(scriptsDirectory, "pnpm-lock.yaml")))
    .digest("hex");
}

export function ensureDependenciesInstalled(): void {
  const installKey = currentInstallKey();
  if (
    existsSync(commanderPackagePath) &&
    existsSync(installKeyPath) &&
    readFileSync(installKeyPath, "utf8").trim() === installKey
  ) {
    return;
  }

  // Keep development tools when refreshing an existing development install.
  const manifest = JSON.parse(
    readFileSync(join(scriptsDirectory, "package.json"), "utf8")
  ) as { devDependencies?: Record<string, string> };
  const developmentInstall = Object.keys(manifest.devDependencies ?? {}).some(
    (name) => existsSync(join(nodeModulesDirectory, name, "package.json"))
  );
  const installArgs = ["install", "--frozen-lockfile", ...(developmentInstall ? [] : ["--prod"])];
  const result = spawnSync(
    "pnpm",
    installArgs,
    { cwd: scriptsDirectory, encoding: "utf8" }
  );
  if (result.error || result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(
      result.error
        ? `Could not run pnpm. Install pnpm 12.11.0, then re-run: ${result.error.message}`
        : `pnpm ${installArgs.join(" ")} exited with status ${result.status}`
    );
  }
  if (!existsSync(commanderPackagePath)) {
    throw new Error(
      `pnpm ${installArgs.join(" ")} completed without installing commander`
    );
  }

  writeFileSync(installKeyPath, `${installKey}\n`);
}
