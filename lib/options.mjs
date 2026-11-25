import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { cancel, createPrompter } from "./ui.mjs";

export const DEFAULT_URL = "http://localhost:4000";

export const FETCH_MODES = {
  lfetch: "noofpi serves its own doofpi API (server/doofpi.ts)",
  pfetch: "browser -> noofpi proxy (server/proxy.ts) -> remote doofpi API",
  dfetch: "browser -> remote doofpi API directly",
  sfetch: "remote doofpi API from the server only, never from the browser",
};

export const TEMPLATES = {
  starter: "welcome page, layout, error page and request logging",
  minimal: "a single welcome page",
};

export const PRESETS = {
  node: "Node server, run with noofpi start",
  bun: "Bun server, run with bun .output/server/start.mjs",
  docker: "Node server plus a generated .output/Dockerfile",
  "cloudflare-worker": "one bundled Cloudflare Worker with static assets",
  "cloudflare-pages": "Cloudflare Pages with a bundled _worker.js",
  "github-pages": "static client-only SPA (dfetch only, no server)",
};

// Presets that have no Node or Bun server, so a Dockerfile makes no sense
const SERVERLESS_PRESETS = [
  "cloudflare-worker",
  "cloudflare-pages",
  "github-pages",
];

export const PACKAGE_MANAGERS = {
  bun: "Bun",
  pnpm: "pnpm",
  yarn: "Yarn",
  npm: "npm",
};

export const DEFAULT_PORT = 3000;

export const USAGE = `create-noofpi <project-name> [options]

Options:
  --template <name>   starter (default) or minimal
  --fetch <mode>      lfetch (default), pfetch, dfetch or sfetch
  --url <url>         Remote doofpi API URL (pfetch, dfetch and sfetch)
  --preset <name>     node (default), bun, docker, cloudflare-worker, cloudflare-pages
                      or github-pages (implies dfetch and no SSR)
  --pm <name>         bun, pnpm, yarn or npm (default: the one running create-noofpi)
  --port <port>       Dev server port (default: ${DEFAULT_PORT})
  --[no-]devtools     Dev-only devtools overlay (default: on)
  --[no-]ssr          Server-side rendering (default: on, required by sfetch)
  --[no-]tailwind     Tailwind CSS (default: on)
  --[no-]ui           noofpi-ui components and theme.css (needs Tailwind, default: off)
  --[no-]images       sharp for optimized images with ?image imports (default: off)
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

Without a TTY or with --yes, install and git only run when asked for.

Examples:
  bun create noofpi my-app
  bun create noofpi my-app --fetch pfetch --url https://api.example.com
  bun create noofpi my-app --preset github-pages --url https://api.example.com
  bun create noofpi . --template minimal --yes`;

const STRING_FLAGS = [
  "template",
  "fetch",
  "url",
  "locales",
  "preset",
  "pm",
  "port",
];
const BOOLEAN_FLAGS = [
  "ssr",
  "tailwind",
  "ui",
  "images",
  "i18n",
  "eslint",
  "prettier",
  "editor",
  "test",
  "docker",
  "ci",
  "install",
  "git",
  "devtools",
  "yes",
  "force",
  "help",
];

export function detectPackageManager() {
  const agent = process.env.npm_config_user_agent ?? "";
  for (const pm of ["bun", "pnpm", "yarn"]) {
    if (agent.startsWith(pm)) return pm;
  }
  return agent.startsWith("npm") ? "npm" : "bun";
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`--port must be a number from 1 to 65535 (got "${value}")`);
  return port;
}

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

export function toPackageName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]+/, "")
    .replace(/[^a-z0-9._-]+/g, "-");
}

const TARGET_ACTIONS = {
  rename: "choose another project name",
  overwrite: "write into it, files with the same name are replaced",
  cancel: "stop without writing anything",
};

// Validates the project name and the target folder before any other question is asked
async function resolveTarget(initial, force, prompter) {
  let name = initial;
  for (;;) {
    const target = path.resolve(name);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(toPackageName(path.basename(target))))
      throw new Error(
        `"${path.basename(target)}" is not a valid project name.`,
      );
    if (force || !existsSync(target) || !readdirSync(target).length)
      return { name, force };
    if (!prompter)
      throw new Error(
        `${target} is not empty. Pick another name or pass --force to write into it.`,
      );
    const action = await prompter.select(
      `${target} is not empty`,
      TARGET_ACTIONS,
      "rename",
    );
    if (action === "overwrite") return { name, force: true };
    if (action === "cancel") {
      prompter.close();
      cancel();
      process.exit(1);
    }
    name = await prompter.text("Project name", "noofpi-app");
  }
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
    const { name, force } = await resolveTarget(
      positional[0] ??
        (prompter
          ? await prompter.text("Project name", "noofpi-app")
          : "noofpi-app"),
      Boolean(values.force),
      prompter,
    );

    const pm = oneOf(
      "pm",
      values.pm ?? detectPackageManager(),
      PACKAGE_MANAGERS,
    );
    const port =
      values.port === undefined ? DEFAULT_PORT : parsePort(values.port);

    const template = oneOf(
      "template",
      await ask("template", "starter", (p) =>
        p.select("Template", TEMPLATES, "starter"),
      ),
      TEMPLATES,
    );
    const preset = oneOf(
      "preset",
      await ask("preset", "node", (p) =>
        p.select("Deploy preset", PRESETS, "node"),
      ),
      PRESETS,
    );
    const staticHost = preset === "github-pages";

    let fetch;
    if (staticHost) {
      if (values.fetch !== undefined) oneOf("fetch", values.fetch, FETCH_MODES);
      if (values.fetch && values.fetch !== "dfetch")
        throw new Error(
          "The github-pages preset has no server, it requires --fetch dfetch",
        );
      fetch = "dfetch";
    } else {
      fetch = oneOf(
        "fetch",
        await ask("fetch", "lfetch", (p) =>
          p.select("Fetch mode", FETCH_MODES, "lfetch"),
        ),
        FETCH_MODES,
      );
    }

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
    if (staticHost) {
      if (values.ssr === true)
        throw new Error("The github-pages preset is client-only, drop --ssr");
      ssr = false;
    } else if (fetch === "sfetch") {
      if (values.ssr === false) throw new Error("sfetch requires SSR");
    } else {
      ssr = await confirm("ssr", true, "Server-side rendering?");
    }

    // noofpi-ui needs Tailwind, so choosing it settles the Tailwind question
    const ui = await confirm("ui", false, "Add noofpi-ui components?");
    if (ui && values.tailwind === false)
      throw new Error(
        "noofpi-ui needs Tailwind CSS (drop --no-tailwind or --ui)",
      );
    const tailwind =
      ui || (await confirm("tailwind", true, "Use Tailwind CSS?"));
    const images = await confirm(
      "images",
      false,
      "Add image optimization (sharp)?",
    );
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

    const eslint = await confirm("eslint", false, "Add ESLint?");
    const prettier = await confirm("prettier", false, "Add Prettier?");
    const editor = await confirm(
      "editor",
      false,
      "Add editor config (.editorconfig, VS Code)?",
    );
    const test = await confirm("test", false, "Add Vitest?");

    // The docker preset already writes .output/Dockerfile, so it only needs the .dockerignore
    let docker = false;
    if (preset === "docker") docker = values.docker ?? true;
    else if (SERVERLESS_PRESETS.includes(preset)) {
      if (values.docker)
        throw new Error(
          `--docker needs the node, bun or docker preset (got ${preset})`,
        );
    } else docker = await confirm("docker", false, "Add a Dockerfile?");

    return {
      name,
      template,
      preset,
      pm,
      port,
      devtools: values.devtools ?? true,
      fetch,
      url,
      ssr,
      tailwind,
      ui,
      images,
      i18n,
      locales,
      eslint,
      prettier,
      editor,
      test,
      docker,
      ci: await confirm("ci", false, "Add a GitHub Actions workflow?"),
      install: await confirm(
        "install",
        false,
        "Install dependencies now?",
        true,
      ),
      git: await confirm("git", false, "Initialize a git repository?", true),
      force,
    };
  } finally {
    prompter?.close();
  }
}
