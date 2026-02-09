import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // Next.js 預設規則
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // ✅ 忽略不需要 lint 的資料夾（取代 .eslintignore）
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "coverage/**",
    ],
  },

  // ✅ 客製化 rule（部署友善）
  {
    rules: {
      /*
       * 1️⃣ unused vars
       * → 不要變成 build error
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],

      /*
       * 2️⃣ Next image warning
       * → 如果專案大量用 <img> 建議先關
       */
      "@next/next/no-img-element": "off",

      /*
       * 3️⃣ React hooks dependency
       * → 保留警告但不阻擋 build
       */
      "react-hooks/exhaustive-deps": "warn",

      /*
       * 4️⃣ 常見 DX 調整
       */
      "no-console": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
];
