import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    ignores: ["lib/ai/gateway.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/api\\.openai\\.com/]",
          message: "OpenAI HTTP calls belong in lib/ai/gateway.ts.",
        },
        {
          selector: "TemplateElement[value.raw=/api\\.openai\\.com/]",
          message: "OpenAI HTTP calls belong in lib/ai/gateway.ts.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Alternate Next output dirs (e2e, roadmap, verify builds) and test artefacts are generated.
    ".next-*/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma client generated into workspace (see schema generator output)
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
