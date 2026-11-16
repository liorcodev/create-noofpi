import { createPrompter } from "./ui.mjs";

export const DEFAULT_URL = "http://localhost:4000";

export const FETCH_MODES = {
  lfetch: "noofpi serves its own doofpi API (server/doofpi.ts)",
  pfetch: "browser -> noofpi proxy (server/proxy.ts) -> remote doofpi API",
  dfetch: "browser -> remote doofpi API directly",
  sfetch: "remote doofpi API from the server only, never from the browser",
};

export const TEMPLATES = {
  starter: "layout, pages, error page, middleware and an API call",
  minimal: "a single page",
};

export const USAGE = `create-noofpi <project-name> [options]

Options:
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

Without a TTY or with --yes, install and git only run when asked for.

Examples:
  bun create noofpi my-app
  bun create noofpi my-app --fetch pfetch --url https://api.example.com
  bun create noofpi . --template minimal --yes`;

const STRING_FLAGS = ["template", "fetch", "url", "locales"];
const BOOLEAN_FLAGS = [
  "ssr",
  "tailwind",
  "i18n",
  "prettier",
  "test",
  "docker",
  "ci",
  "install",
  "git",
  "yes",
  "force",
  "help",
];

export function parseArgs(argv) {
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") values.help = true;
    else if (!arg.startsWith("--")) positional.push(arg);
    else {
      const eq = arg.indexOf("=");
      const flag = arg.slice(2, eq === -1 ? undefined : eq);
      const inline = eq === -1 ? undefined : arg.slice(eq + 1);
      if (STRING_FLAGS.includes(flag)) {
        const value = inline ?? argv[++i];
        if (value === undefined || value.startsWith("--"))
          throw new Error(`--${flag} needs a value`);
        values[flag] = value;
      } else if (BOOLEAN_FLAGS.includes(flag)) {
        values[flag] = inline === undefined ? true : inline !== "false";
      } else if (
        flag.startsWith("no-") &&
        BOOLEAN_FLAGS.includes(flag.slice(3))
      ) {
        values[flag.slice(3)] = false;
      } else {
        throw new Error(`Unknown option --${flag}`);
      }
    }
  }
  return { values, positional };
}

function parseLocales(value) {
  const locales = [
    ...new Set(
      value
        .split(",")
        .map((locale) => locale.trim())
        .filter(Boolean),
    ),
  ];
  const invalid = locales.find(
    (locale) => !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(locale),
  );
  if (!locales.length || invalid)
    throw new Error(
      `"${invalid ?? value}" is not a valid locale list (example: en,he)`,
    );
  return locales;
}

function oneOf(flag, value, allowed) {
  if (!Object.hasOwn(allowed, value))
    throw new Error(
      `--${flag} must be one of ${Object.keys(allowed).join(", ")} (got "${value}")`,
    );
  return value;
}

export async function resolveOptions(values, positional) {
  const interactive =
    Boolean(process.stdin.isTTY && process.stdout.isTTY) && !values.yes;
  const prompter = interactive ? createPrompter() : null;
  // A flag wins, then the prompt (interactive), then the fallback
  const ask = async (key, fallback, prompt) =>
    values[key] ?? (prompter ? await prompt(prompter) : fallback);
  const confirm = (key, fallback, message, promptDefault = fallback) =>
    ask(key, fallback, (p) => p.confirm(message, promptDefault));

  try {
    const name =
      positional[0] ??
      (prompter ? await prompter.text("Project name", "noofpi-app") : "noofpi-app");

    const template = oneOf(
      "template",
      await ask("template", "starter", (p) =>
        p.select("Template", TEMPLATES, "starter"),
      ),
      TEMPLATES,
    );
    const fetch = oneOf(
      "fetch",
      await ask("fetch", "lfetch", (p) =>
        p.select("Fetch mode", FETCH_MODES, "lfetch"),
      ),
      FETCH_MODES,
    );

    const remote = fetch !== "lfetch";
    let url;
    if (remote) {
      url =
        values.url ??
        (prompter
          ? await prompter.text("Remote doofpi API URL", DEFAULT_URL)
          : DEFAULT_URL);
      if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol))
        throw new Error(`"${url}" is not an absolute http(s) URL`);
      url = url.replace(/\/+$/, "");
    }

    let ssr = true;
    if (fetch === "sfetch") {
      if (values.ssr === false) throw new Error("sfetch requires SSR");
    } else {
      ssr = await confirm("ssr", true, "Server-side rendering?");
    }

    const tailwind = await confirm("tailwind", true, "Use Tailwind CSS?");
    const i18n = await confirm("i18n", false, "Add i18n?");
    let locales = ["en"];
    if (i18n)
      locales = parseLocales(
        values.locales ??
          (prompter
            ? await prompter.text(
                "Locales (comma separated, first is the default)",
                "en",
              )
            : "en"),
      );

    return {
      name,
      template,
      fetch,
      url,
      ssr,
      tailwind,
      i18n,
      locales,
      prettier: await confirm("prettier", false, "Add Prettier?"),
      test: await confirm("test", false, "Add Vitest?"),
      docker: await confirm("docker", false, "Add a Dockerfile?"),
      ci: await confirm("ci", false, "Add a GitHub Actions workflow?"),
      install: await confirm("install", false, "Install dependencies now?", true),
      git: await confirm("git", false, "Initialize a git repository?", true),
      force: Boolean(values.force),
    };
  } finally {
    prompter?.close();
  }
}
