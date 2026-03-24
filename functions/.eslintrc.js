module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    ".eslintrc.js",
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    "max-len": "off", // Disable max length rule
    "require-jsdoc": "off", // Disable require-jsdoc rule
    "@typescript-eslint/no-explicit-any": "off", // Allow any
    "@typescript-eslint/no-unused-vars": ["warn", {
      "argsIgnorePattern": "^_"
    }], // Warn on unused vars, but ignore those starting with _
    "object-curly-spacing": "off",
  },
};
