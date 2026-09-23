import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat-config ESLint.
 *
 * The project previously had no lint configuration at all, and its `lint`
 * script called `next lint`, which Next 16 removed — so linting had never run.
 *
 * Rules are set at a level that the existing codebase can realistically reach:
 * correctness and safety rules are errors, stylistic preferences are warnings
 * or off. The `no-console` rule matters most — there is a structured logger at
 * src/lib/observability/logger.ts and bare console calls bypass PII redaction.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "next-env.d.ts",
      "supabase/functions/**",
      "*.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        ReadableStream: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        globalThis: "readonly",
        crypto: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLDivElement: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        Event: "readonly",
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Use the structured logger — bare console bypasses PII redaction.
      "no-console": ["warn", { allow: ["warn", "error"] }],

      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",

      // React Compiler diagnostics. Real signal, but the existing components
      // predate them — kept visible as warnings rather than blocking CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Reading a ref during render genuinely breaks rendering — stays an error.
      "react-hooks/refs": "error",

      // Catches the `catch {}` / empty-block class of swallowed failure.
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  {
    // The logger is the one place allowed to call console directly.
    files: ["src/lib/observability/logger.ts"],
    rules: { "no-console": "off" },
  },

  {
    // CommonJS config files at the repo root.
    files: ["*.js", "*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
  },

  {
    files: ["tests/**/*.{ts,tsx}", "*.config.{ts,mts,mjs}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
