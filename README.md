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
--[no-]ssr          Server-side rendering (default: on, required by sfetch)
--[no-]tailwind     Tailwind CSS (default: on)
--[no-]i18n         Typed i18n, locales in app/locales (default: off)
--locales <list>    Comma separated locales, the first is the default (default: en)
--[no-]prettier     Prettier config and format scripts
--[no-]test         Vitest setup
--[no-]docker       Dockerfile and .dockerignore
--[no-]ci           GitHub Actions workflow
--[no-]install      Install dependencies after scaffolding
--[no-]git          Run git init
--yes               Skip the prompts and use the defaults
--force             Write into the directory even if it is not empty
```

Without a TTY or with `--yes`, install and git only run when asked for.

### Templates

- `starter`: layout, pages, error page, middleware and an API call.
- `minimal`: a single page.

### Fetch modes

- `lfetch`: noofpi serves its own doofpi API (`server/doofpi.ts`).
- `pfetch`: browser to noofpi proxy (`server/proxy.ts`) to a remote doofpi API.
- `dfetch`: browser to a remote doofpi API directly.
- `sfetch`: remote doofpi API from the server only, never from the browser.

## Examples

```sh
bun create noofpi my-app
bun create noofpi my-app --fetch pfetch --url https://api.example.com
bun create noofpi . --template minimal --yes
```

## Documentation

https://liorcodev.github.io/noofpi-docs/

## License

MIT
