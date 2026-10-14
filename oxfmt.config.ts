import type { OxfmtConfig } from "oxfmt";
import base from "@aranlucas/oxforge/format-config";

const config: OxfmtConfig = {
  ...base,
  // Keyword ordering is shared with generated plugin and marketplace manifests.
  sortPackageJson: false,
};

export default config;
