import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
  }),
  {
    ignores: [
      ".next/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "out/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
