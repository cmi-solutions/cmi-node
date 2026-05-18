export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'header-max-length': [2, 'always', 100],
        'subject-case': [
            2,
            'never',
            ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
        ],
        'scope-case': [
            2,
            'never',
            ['start-case', 'camel-case', 'pascal-case', 'sentence-case'],
        ],
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
