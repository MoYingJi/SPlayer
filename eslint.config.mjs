import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import globals from "globals";
import autoEslint from "./auto-eslint.mjs";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/out",
      "**/.gitignore",
      "**/docs",
      "**/auto-imports.d.ts",
      "**/components.d.ts",
      "**/resources/**",
      "native/**/index.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      vue,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoEslint.globals,
      },

      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        parser: tseslint.parser,
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [".github/scripts/prepare-release-assets.cjs"],

    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2020,
      sourceType: "commonjs",
    },

    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
