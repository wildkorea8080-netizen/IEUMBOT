import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const typeScriptRules = {
  // js.configs.recommended가 켜는 base 규칙 둘은 TS 파일에서 반드시 꺼야 한다
  // (typescript-eslint 공식 권장). base no-undef는 타입 참조를 변수로 오해해서
  // `EventListener`, `HTMLElement` 같은 DOM 타입마다 오류를 낸다. 미정의 변수는
  // 타입 검사기가 이미 잡는다. no-unused-vars는 아래 TS 버전이 대체한다.
  "no-undef": "off",
  "no-unused-vars": "off",
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
  ]
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      // 빌드 산출물. widget.js는 packages/widget 빌드가 복사해 넣는 번들이라
      // 검사 대상이 아니다(미니파이된 한 줄에서 no-undef가 수백 건 쏟아진다).
      "apps/web/public/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {},
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...typeScriptRules
    }
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {},
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...typeScriptRules
    }
  }
];
