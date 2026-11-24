// React Doctor configuration (CODING_STANDARDS.md, "React Doctor: a score floor that only rises").
export default {
  // .oxlintrc.json already runs via `npm run lint` with lint-baseline.json; adopting it here
  // double-counts exhaustive-deps and would break the floor when new baselined rules land.
  adoptExistingLintConfig: false,

  // The score floor in react-doctor-floor.json is the CI gate, not unverified error findings
  // (known false positives at App.jsx, Modals.jsx, and sheets/volume.jsx).
  blocking: 'none',

  ignore: {
    // Exclude build/check scripts and test files from the React Doctor score.
    files: [
      'scripts/**',
      '**/*.test.*',
      '**/*.spec.*',
      'src/test/**',
    ],
    rules: [
      // cloneProfile (src/lib/profile/plain.js) keeps a JSON fallback when structuredClone
      // is unavailable or rejects Immer proxies.
      'react-doctor/no-json-parse-stringify-clone',
      // Shared component modules intentionally export helpers and constants alongside components.
      'react-doctor/only-export-components',
    ],
  },
}
