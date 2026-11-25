export default {
  adoptExistingLintConfig: false,

  blocking: 'none',

  ignore: {
    files: [
      'scripts/**',
      '**/*.test.*',
      '**/*.spec.*',
      'src/test/**',
    ],
    rules: [
      'react-doctor/no-json-parse-stringify-clone',
      'react-doctor/only-export-components',
      'react-hooks-js/static-components',
      'react-hooks-js/purity',
    ],
  },
}
