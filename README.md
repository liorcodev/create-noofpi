# create-noofpi

Scaffold a new [noofpi](https://www.npmjs.com/package/noofpi) project.

```sh
bun create noofpi my-app
```

Also works with `pnpm create noofpi`, `yarn create noofpi` and `npm create noofpi`. Requires Node.js 20 or newer.

Run it without flags for interactive prompts, or pass options to skip them.

## Options

```
create-noofpi <project-name> [options]

--template <name>   starter (default) or minimal
--fetch <mode>      lfetch (default), pfetch, dfetch or sfetch
--url <url>         Remote doofpi API URL (pfetch, dfetch and sfetch)
--preset <name>     node (default), bun, docker, cloudflare-worker, cloudflare-pages
                    or github-pages (implies dfetch and no SSR)
--pm <name>         bun, pnpm, yarn or npm (default: the one running create-noofpi)
--port <port>       Dev server port (default: 3000)
--[no-]devtools     Dev-only devtools overlay (default: on)
--[no-]ssr          Server-side rendering (default: on, required by sfetch)
--[no-]tailwind     Tailwind CSS (default: on)
--[no-]ui           noofpi-ui components and theme.css (needs Tailwind, default: off)
--[no-]i18n         Typed i18n, locales in app/locales (default: off)
--locales <list>    Comma separated locales, the first is the default (default: en)
--[no-]eslint       ESLint config and lint script
--[no-]prettier     Prettier config and format scripts
--[no-]editor       .editorconfig and VS Code extension recommendations
--[no-]test         Vitest setup
--[no-]docker       Dockerfile and .dockerignore (node, bun and docker presets)
--[no-]ci           GitHub Actions workflow
--[no-]install      Install dependencies after scaffolding
--[no-]git          Run git init
--yes               Skip the prompts and use the defaults
--force             Write into the directory even if it is not empty
```

Without a TTY or with `--yes`, install and git only run when asked for.

### Templates

- `starter`: welcome page, layout, error page, request-logging server middleware and example component, composable and util.
- `minimal`: a single welcome page.

### Presets

- `node`, `bun`: a server build. `bun` serves with `Bun.serve`.
- `docker`: the `node` build plus a generated `.output/Dockerfile`.
- `cloudflare-worker`, `cloudflare-pages`: adds Wrangler, a `wrangler.json` and a `deploy` script.
- `github-pages`: a client-only SPA. Forces `dfetch` and no SSR, and adds a Pages deploy workflow.

The generated scripts, Dockerfile and CI workflow use the package manager from `--pm`.

### Fetch modes

- `lfetch`: noofpi serves its own doofpi API (`server/doofpi.ts`).
- `pfetch`: browser to noofpi proxy (`server/proxy.ts`) to a remote doofpi API.
- `dfetch`: browser to a remote doofpi API directly.
- `sfetch`: remote doofpi API from the server only, never from the browser.

## Examples

```sh
bun create noofpi my-app
bun create noofpi my-app --fetch pfetch --url https://api.example.com
bun create noofpi my-app --preset github-pages --url https://api.example.com
bun create noofpi . --template minimal --yes
```

## Documentation

https://liorcodev.github.io/noofpi-docs/

## License

MIT
