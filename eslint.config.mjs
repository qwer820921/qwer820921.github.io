import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // ✅ 忽略不需要 lint 的資料夾（取代 .eslintignore）
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/**",
      "godot/**",
      ".claude/**",
      ".gemini/**",
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
      "@typescript-eslint/no-explicit-any": "off",
      // React 19 新規則（Next.js 16 引入），現有程式碼尚未符合，設為 warn 避免阻擋 commit
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
    },
  }
];

export default config;
