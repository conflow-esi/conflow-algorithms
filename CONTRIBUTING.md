# Contributing

## Setup

```sh
git clone https://github.com/conflow-esi/conflow-algorithms.git
cd conflow-algorithms
npm install
```

## Running Tests

```sh
npm test
```

Tests are written with [Vitest](https://vitest.dev/) and live alongside source files as `*.test.ts`.

## Building

```sh
npm run build
```

Compiled output goes to `dist/`.

## Pull Requests

1. Fork the repository and create a branch from `main`.
2. Add or update tests for any behaviour you change.
3. Make sure `npm test` and `npm run build` pass.
4. Open a pull request with a clear description of what changed and why.

## Reporting Issues

Open an issue on GitHub. Include a minimal reproducible example where possible.
