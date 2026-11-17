# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.1] - 2026-11-17

### Changed

- Starter template: `server/middleware/log.ts` replaces `app/middleware/log.global.ts`. It logs every request (pages, the doofpi API and the proxy) with its response status, method, path and duration in dev, instead of only logging navigations.

### Removed

- Starter template: `app/middleware/log.global.ts`.

## [1.1.0] - 2026-11-17

### Added

- `--preset <name>`: `node` (default), `bun`, `docker`, `cloudflare-worker`, `cloudflare-pages` and `github-pages`. Cloudflare presets add Wrangler, `wrangler.json` and a `deploy` script with typed bindings. `github-pages` is a client-only SPA (forces `dfetch`, no SSR) with a Pages deploy workflow.
- `--pm <name>` (`bun`, `pnpm`, `yarn`, `npm`), defaulting to the package manager running `create-noofpi`. Scripts, Dockerfile, CI and next steps use it.
- `--port <port>` for the dev server and the Dockerfile.
- `--[no-]devtools`, `--[no-]ui` (noofpi-ui and `theme.css`), `--[no-]eslint` and `--[no-]editor` (`.editorconfig`, VS Code recommendations).
- Prompt to rename, overwrite or cancel when the target directory is not empty, and project name validation up front.
- Starter template: example `Hint` component, `useToggle` composable, `clamp` util and a richer `log.global.ts` middleware.
- Logo, and a new favicon, in the generated project.

### Changed

- `--docker` now applies to the `node`, `bun` and `docker` presets only.
- The generated welcome page no longer calls the doofpi API (`useDoofpiFetch`).
- Generated projects depend on `noofpi` `^1.1.0`.
- `.wrangler` is in the generated `.gitignore`; `.prettierignore` also covers other lockfiles and `worker-configuration.d.ts`.
- README documents presets and the new options.

### Fixed

- The `pfetch` proxy hook (`server/proxy.ts`) no longer destructures an unused `request`, so `--fetch pfetch --eslint` projects pass `lint` out of the box.

## [1.0.0]

Initial release.

[1.1.0]: https://github.com/liorcodev/create-noofpi/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/liorcodev/create-noofpi/releases/tag/v1.0.0
