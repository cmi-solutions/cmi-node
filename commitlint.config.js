// Headers already in the history from before commitlint ran in CI. They cannot be
// reworded without rewriting shared branches, so they are skipped. Legacy commits only.
const LEGACY_HEADERS = [
    'docs: update documentation with comprehensive framework integration examples and define contribution guidelines',
    'MERGE develop into preprod (#23)',
    'Docs/dev guide (#16)',
];

export default {
    extends: ['@commitlint/config-conventional'],
    ignores: [(message) => LEGACY_HEADERS.includes(message.split('\n', 1)[0].trim())],
    rules: {
        'header-max-length': [2, 'always', 100],
        // Warn only: squash merges copy every commit body (and its long lines) into one message.
        'body-max-line-length': [1, 'always', 100],
        'subject-case': [
            2,
            'never',
            ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
        ],
        // Scopes are lower-case, e.g. feat(core) or fix(callback-handler).
        // The old "never camel-case" rule rejected every one-word scope such as `core`.
        'scope-case': [2, 'always', 'lower-case'],
        'type-enum': [
            2,
            'always',
            [
                'feat',     // A new feature
                'fix',      // A bug fix
                'docs',     // Documentation only changes
                // 'style',    // Formatting, missing semi-colons, etc. (no code change)
                'refactor', // Refactoring
                // 'perf',     // Performance improvements
                'test',     // Adding missing tests or correcting existing tests
                'chore',    // Build process, auxiliary tools and libraries, dependency updates
                // 'build',    // Build system or external dependencies (e.g. gulp, broccoli, npm)
                'ci',       // Changes to CI configuration files and scripts (e.g. .travis.yml)
                // 'revert'    // Reverting a previous commit
                'release'   // Release new version
            ]
        ]
    }
};
