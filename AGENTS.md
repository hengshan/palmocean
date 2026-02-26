# Kepler.gl Development Guide

## Cursor Cloud specific instructions

### Overview
kepler.gl is a data-agnostic, high-performance web-based geolocation visualization tool. It is a React/Redux monorepo with ~20 workspace packages under `src/`, a demo app under `examples/demo-app/`, and a marketing website under `website/`.

### Node and Package Manager
- **Node.js 18.18.2** is required (see `.nvmrc`). Use `nvm install && nvm use` to activate.
- **Yarn 4.4.0** is the package manager (see `packageManager` field in `package.json`). Enable via `corepack enable`.

### Key Commands
Standard commands are documented in `contributing/DEVELOPERS.md` and `package.json` scripts. Key ones:

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `yarn install && yarn fix-dependencies` | `fix-dependencies` patches third-party modules |
| Create dist stubs | `yarn workspaces foreach -At run stab` | Required before starting the demo app so workspace `exports` resolve |
| Start demo app | `cd examples/demo-app && NODE_ENV=local node esbuild.config.mjs --start` | Serves at `http://localhost:8080`. Requires `MapboxAccessToken` env var for map tiles. |
| Lint | `yarn lint` | Runs `tsc --noEmit` then ESLint with `--fix`. Existing code has minor prettier diffs that auto-fix resolves. |
| Type check only | `yarn typescript` | |
| Test (all) | `yarn test` | Runs Jest + Tape (node + jsdom) |
| Test Jest only | `yarn test-jest` | 13 suites, 135 tests |
| Test node (tape) | `yarn test-node` | ~10,751 tests |
| Test browser (jsdom) | `yarn test-browser` | ~2,715 tests |

### Gotchas
- **Stab scripts are required**: Before starting the demo app, you must run `yarn workspaces foreach -At run stab` to create stub `dist/` directories in workspace packages. Without this, esbuild cannot resolve subpath exports like `@kepler.gl/duckdb/components`.
- **Demo app must be started from its directory**: The esbuild config uses relative paths (`../../node_modules`). Running it from the repo root will fail to resolve dependencies.
- **deck.gl WebGL error in headless environments**: The "An error in deck.gl: Failed to create" notification is expected in environments without GPU/WebGL support. The app UI and data loading still function correctly.
- **Missing optional env vars**: Warnings about `DropboxClientId`, `CartoClientId`, `FoursquareClientId`, etc. are non-blocking. Only `MapboxAccessToken` is required for core functionality.
- The `yarn lint` command includes `--fix`, so it auto-fixes formatting. Discard changes with `git checkout -- .` if you don't want to commit lint fixes.
- Demo app dependencies must be installed separately: `cd examples/demo-app && yarn install`.
