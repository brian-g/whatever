import eslint from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

export default [
  eslint.configs.recommended,
  {

    languageOptions: {
      globals: {
        ...globals.builtin,
        ...globals.nodeBuiltin,
        ...globals.browser,
        ...globals.node,
      },

      parser: babelParser,
      ecmaVersion: 2019,
      sourceType: "module",
    },
  }
];