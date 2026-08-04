import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Texte en francais : apostrophes et guillemets dans le JSX sont voulus
      "react/no-unescaped-entities": "off",
      // Pattern "mounted" volontaire dans ThemeToggle/ThemeContext
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
