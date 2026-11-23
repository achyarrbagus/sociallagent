import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored ClipLab runtime (MIT), kept byte-for-byte with upstream.
    "src/lib/cliplab/**",
    // Platform adapters ported verbatim from socialagent.
    "src/lib/social/adapters/**",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
