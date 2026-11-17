import {
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, DEFAULT_URL, FETCH_MODES } from "./options.mjs";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function generateProject(options, target) {
  const extras = [
    options.template === "starter" && "starter",
    options.ui && "ui",
    options.fetch === "lfetch" && "lfetch",
    options.fetch === "pfetch" && "pfetch",
    options.prettier && "prettier",
    options.docker && "docker",
  ].filter(Boolean);

  cpSync(path.join(packageRoot, "template"), target, { recursive: true });
  // npm strips .gitignore from published packages, so the template ships it as _gitignore
  renameSync(path.join(target, "_gitignore"), path.join(target, ".gitignore"));
  for (const extra of extras)
    cpSync(path.join(packageRoot, "extras", extra), target, { recursive: true });

  for (const [file, content] of generatedFiles(options)) {
    const full = path.join(target, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function generatedFiles(o) {
  const starter = o.template === "starter";
  const remote = o.fetch !== "lfetch";
  const files = new Map([
    ["package.json", packageJson(o)],
    ["noofpi.config.ts", configFile(o)],
    ["README.md", readme(o)],
    ["app/assets/main.css", mainCss(o)],
    ["app/pages/index.vue", indexPage(o)],
  ]);

  if (starter) {
    files.set("app/layouts/default.vue", layout(o));
    files.set("app/error.vue", errorPage(o));
  }
  if (o.i18n) {
    const [defaultLocale, ...others] = o.locales;
    const messages = literal(messagesFor(o));
    files.set(
      `app/locales/${defaultLocale}.ts`,
      `export default defineMessages(${messages});\n`,
    );
    for (const locale of others)
      files.set(
        `app/locales/${locale}.ts`,
        [
          `import type { LocaleMessages } from "noofpi/runtime";`,
          `import type base from "./${defaultLocale}";`,
          "",
          "// TODO: translate",
          `export default defineMessages(${messages}) satisfies LocaleMessages<typeof base>;`,
          "",
        ].join("\n"),
      );
  }
  if (remote) {
    files.set(".env", `DOOFPI_URL=${o.url}\n`);
    files.set(".env.example", `DOOFPI_URL=${DEFAULT_URL}\n`);
  }
  if (o.test) files.set("tests/config.test.ts", testFile(o));
  if (o.eslint) files.set("eslint.config.js", ESLINT_CONFIG);
  if (o.editor) {
    files.set(".editorconfig", EDITORCONFIG);
    files.set(".vscode/extensions.json", vscodeExtensions(o));
  }
  if (o.docker && o.preset !== "docker") files.set("Dockerfile", dockerfile(o));
  if (o.preset.startsWith("cloudflare-")) {
    files.set("wrangler.json", wranglerConfig(o));
    // `wrangler types` writes worker-configuration.d.ts, the typed bindings
    files.set("tsconfig.json", tsconfig());
    if (o.fetch === "lfetch") files.set("server/doofpi.ts", typedDoofpi());
  }
  if (o.ci) files.set(".github/workflows/ci.yml", workflow(o));
  if (o.preset === "github-pages")
    files.set(".github/workflows/deploy.yml", pagesWorkflow(o));
  return files;
}

// Shell command that runs a package.json script, npm needs -- before extra arguments
const script = (o, name, args = "") =>
  `${o.pm} run ${name}${args ? (o.pm === "npm" ? " -- " : " ") + args : ""}`;

const ESLINT_CONFIG = `import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: [".noofpi", ".output", "node_modules", "worker-configuration.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // Auto-imports are typed by .noofpi/auto-imports.d.ts, TypeScript already checks them
      "no-undef": "off",
      // Pages like index.vue are single words
      "vue/multi-word-component-names": "off",
    },
  },
);
`;

function tsconfig() {
  const template = readFileSync(path.join(packageRoot, "template", "tsconfig.json"), "utf-8");
  return template.replace('"env.d.ts"]', '"env.d.ts", "worker-configuration.d.ts"]');
}

// `Env` is the global from worker-configuration.d.ts, so `env` in handlers is typed with the wrangler.json bindings
function typedDoofpi() {
  const source = readFileSync(
    path.join(packageRoot, "extras", "lfetch", "server", "doofpi.ts"),
    "utf-8",
  );
  return source.replace(
    'new Doofpi({ root: "/doofpi" });',
    'new Doofpi({ root: "/doofpi" }).defineEnv<Env>();',
  );
}

// Owned by the project (add bindings here); noofpi build only writes into .output/
function wranglerConfig(o) {
  const common = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: o.name,
    compatibility_date: new Date().toISOString().slice(0, 10),
    compatibility_flags: ["nodejs_compat"],
  };
  const config =
    o.preset === "cloudflare-worker"
      ? {
          ...common,
          main: ".output/server/index.mjs",
          assets: { directory: ".output/public" },
        }
      : { ...common, pages_build_output_dir: ".output/public" };
  return JSON.stringify(config, null, 2) + "\n";
}

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
`;

function vscodeExtensions(o) {
  const recommendations = ["Vue.volar"];
  if (o.tailwind) recommendations.push("bradlc.vscode-tailwindcss");
  if (o.eslint) recommendations.push("dbaeumer.vscode-eslint");
  if (o.prettier) recommendations.push("esbenp.prettier-vscode");
  return JSON.stringify({ recommendations }, null, 2) + "\n";
}

const sorted = (object) =>
  Object.fromEntries(
    Object.entries(object).sort(([a], [b]) => a.localeCompare(b)),
  );

function packageJson(o) {
  const scripts = {
    dev: "noofpi dev",
    build: "noofpi build",
    start: "noofpi start",
    typecheck: "vue-tsc --noEmit",
  };
  if (o.test) scripts.test = "vitest run";
  if (o.eslint) scripts.lint = "eslint .";
  if (o.prettier) {
    scripts.format = "prettier --write .";
    scripts["format:check"] = "prettier --check .";
  }
  if (o.preset.startsWith("cloudflare-")) scripts.types = "wrangler types";
  if (o.preset === "cloudflare-worker")
    scripts.deploy = "noofpi build && wrangler deploy";
  if (o.preset === "cloudflare-pages")
    scripts.deploy = "noofpi build && wrangler pages deploy .output/public";
  const dependencies = { doofpi: "^1.3.1", noofpi: "^1.1.0", vue: "^3.5.45" };
  if (o.ui) dependencies["noofpi-ui"] = "^1.0.1";
  if (o.fetch === "lfetch") dependencies.zod = "^4.6.7";
  const devDependencies = {
    "@types/node": "^24.19.2",
    typescript: "~6.0.3",
    "vue-tsc": "^3.3.14",
  };
  if (o.eslint)
    Object.assign(devDependencies, {
      "@eslint/js": "^10.0.1",
      eslint: "^10.15.0",
      "eslint-plugin-vue": "^10.12.1",
      "typescript-eslint": "^8.73.0",
    });
  if (o.prettier) devDependencies.prettier = "^3.10.1";
  if (o.test) devDependencies.vitest = "^4.1.12";
  if (o.preset.startsWith("cloudflare-")) devDependencies.wrangler = "^4.163.0";
  return (
    JSON.stringify(
      {
        name: o.name,
        private: true,
        type: "module",
        scripts,
        dependencies: sorted(dependencies),
        devDependencies: sorted(devDependencies),
      },
      null,
      2,
    ) + "\n"
  );
}

function configFile(o) {
  const vite = [
    // github.io project sites are served from /<repo>/, the deploy workflow sets BASE_PATH
    ...(o.preset === "github-pages" ? [`base: process.env.BASE_PATH ?? "/"`] : []),
    ...(o.ui ? ["plugins: [noofpiUi()]"] : []),
  ];
  const lines = [
    `import { defineNoofpiConfig } from "noofpi";`,
    ...(o.ui ? [`import { noofpiUi } from "noofpi-ui/vite";`] : []),
    "",
    "export default defineNoofpiConfig({",
    `  ssr: ${o.ssr},`,
    `  tailwind: ${o.tailwind},`,
    ...(o.preset !== "node" ? [`  build: { preset: "${o.preset}" },`] : []),
    ...(o.port !== DEFAULT_PORT ? [`  devServer: { port: ${o.port} },`] : []),
    ...(o.devtools ? [] : ["  devtools: false,"]),
    ...(vite.length ? [`  vite: { ${vite.join(", ")} },`] : []),
    "  head: {",
    `    title: "%s | ${o.name}",`,
    `    link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],`,
    "  },",
    "  doofpi: {",
    `    fetch: "${o.fetch}",`,
  ];
  if (o.fetch !== "lfetch") lines.push("    url: process.env.DOOFPI_URL,");
  lines.push('    root: "/doofpi",', "  },");
  if (o.i18n)
    lines.push(
      `  i18n: { locales: ${list(o.locales)}, defaultLocale: "${o.locales[0]}" },`,
    );
  if (o.template === "starter")
    lines.push(
      "  // fonts: {",
      '  //   families: [{ provider: "google", name: "Inter", weight: "100 900", alias: "sans" }],',
      "  // },",
      '  // routeRules: { "/admin/**": { ssr: false } },',
    );
  lines.push("});", "");
  return lines.join("\n");
}

const PLAIN_CSS = `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

body {
  margin: 0;
  background: #fff;
  color: #111827;
}

@media (prefers-color-scheme: dark) {
  body {
    background: #030712;
    color: #f3f4f6;
  }
}

.shell {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 3rem 1.5rem;
  text-align: center;
}

.glow {
  position: absolute;
  top: -10rem;
  left: 50%;
  width: 48rem;
  max-width: 100%;
  height: 24rem;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: rgb(16 185 129 / 0.2);
  filter: blur(64px);
  pointer-events: none;
}

.content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo {
  width: 5rem;
  height: 5rem;
  filter: drop-shadow(0 10px 15px rgb(16 185 129 / 0.35));
}

h1 {
  margin: 2rem 0 0;
  font-size: clamp(2.5rem, 8vw, 3.75rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.gradient {
  background: linear-gradient(to right, #10b981, #2dd4bf);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hint {
  margin: 1rem 0 0;
  color: #6b7280;
  font-size: 1.125rem;
}

code {
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  background: #8881;
  color: #059669;
  font-family: ui-monospace, monospace;
  font-size: 0.95em;
}

.cards {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 52rem;
  margin-top: 3rem;
}

@media (min-width: 40rem) {
  .cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

.card {
  padding: 1.25rem;
  border: 1px solid #8884;
  border-radius: 0.75rem;
  color: inherit;
  text-align: left;
  text-decoration: none;
  transition: border-color 0.15s, transform 0.15s;
}

.card:hover {
  border-color: #10b981;
  transform: translateY(-2px);
}

.card strong {
  display: block;
  font-size: 1.05rem;
}

.card span {
  display: block;
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.badge {
  margin-top: 2rem;
  padding: 0.25rem 0.75rem;
  border: 1px solid #8884;
  border-radius: 9999px;
  color: #6b7280;
  font-size: 0.8rem;
}

.badge b {
  color: #059669;
  font-family: ui-monospace, monospace;
}

.locales {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  gap: 0.5rem;
}

.error-code {
  font-size: clamp(4rem, 18vw, 8rem);
  font-weight: 800;
  line-height: 1;
}

.back {
  margin-top: 2rem;
  padding: 0.6rem 1.25rem;
  border: 0;
  border-radius: 0.5rem;
  background: #059669;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.back:hover {
  background: #047857;
}
`;

const UI_CSS = `@import "tailwindcss";

/* Color Theme Studio export: --color-theme-50 ... 950 and a \`.theme.<name>\` class per theme */
@import "./theme.css";

/* noofpi-ui follows --color-theme-* by itself */
@import "noofpi-ui";

/* Override a token with plain CSS after the import */
:root {
  --ui-radius: 0.5rem;
}
`;

function mainCss(o) {
  if (!o.tailwind) return PLAIN_CSS;
  return o.ui ? UI_CSS : '@import "tailwindcss";\n';
}

const UI_CARD_TEXT = "Ready-made components and themes for noofpi.";

const HOME_MESSAGES = {
  title: "Home",
  welcome: "Welcome to",
  edit: "Get started by editing",
  docs: "Documentation",
  docsText: "Learn how pages, fetching and config work.",
  github: "GitHub",
  githubText: "Star the project and follow along.",
  mode: "Fetch mode",
};

const MESSAGES = {
  minimal: { home: HOME_MESSAGES },
  starter: { home: HOME_MESSAGES, error: { back: "Back home" } },
};

// The noofpi-ui card only exists on the home page when noofpi-ui is not installed
const messagesFor = (o) => {
  const messages = MESSAGES[o.template];
  if (o.ui) return messages;
  return { ...messages, home: { ...messages.home, uiText: UI_CARD_TEXT } };
};

function literal(value, depth = 1) {
  if (typeof value === "string") return JSON.stringify(value);
  const pad = "  ".repeat(depth);
  const entries = Object.entries(value).map(
    ([key, item]) => `${pad}${key}: ${literal(item, depth + 1)},`,
  );
  return `{\n${entries.join("\n")}\n${"  ".repeat(depth - 1)}}`;
}

function helpers(o) {
  const cls = (tailwind, plain = "") => {
    // With noofpi-ui the accent follows the theme.css primary color
    const themed = o.ui
      ? tailwind.replaceAll("emerald-", "primary-").replaceAll("teal-400", "primary-300")
      : tailwind;
    const value = o.tailwind ? themed : plain;
    return value ? ` class="${value}"` : "";
  };
  const tx = (key, text) => (o.i18n ? `{{ $t("${key}") }}` : text);
  const title = (key, text) =>
    o.i18n ? `useHead(() => ({ title: t("${key}") }));` : `useHead({ title: "${text}" });`;
  return { cls, tx, title };
}

const list = (items) => `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;

const indent = (lines, size) =>
  lines
    .join("\n")
    .split("\n")
    .map((line) => (line ? " ".repeat(size) + line : line))
    .join("\n");

function sfc(script, tag, attrs, body) {
  const parts = [];
  if (script.length)
    parts.push(`<script setup lang="ts">\n${script.join("\n")}\n</script>\n`);
  parts.push(`<template>\n  <${tag}${attrs}>\n${indent(body, 4)}\n  </${tag}>\n</template>\n`);
  return parts.join("\n");
}

// Full-screen centered shell with a soft glow, shared by the home and error pages
function shell(o, content) {
  const { cls } = helpers(o);
  return [
    `<main${cls("relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 text-center", "shell")}>`,
    `  <div${cls("pointer-events-none absolute -top-40 left-1/2 h-96 w-3xl max-w-full -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl", "glow")} aria-hidden="true" />`,
    `  <div${cls("relative flex flex-col items-center", "content")}>`,
    indent(content, 4),
    "  </div>",
    "</main>",
  ];
}

function indexPage(o) {
  const { cls, tx, title } = helpers(o);
  const script = [
    "// Served from public/; bound dynamically so the bundler leaves the URL alone",
    'const logo = "/logo.svg";',
  ];
  if (o.i18n) script.push("", "const { t } = useI18n();");
  script.push(title("home.title", "Home"));

  const card = (href, name, text) => [
    `<a href="${href}" target="_blank" rel="noopener"${cls("block rounded-xl border border-gray-500/25 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-500", "card")}>`,
    `  <strong${cls("block font-semibold")}>${name}</strong>`,
    `  <span${cls("mt-1 block text-sm text-gray-500")}>${text}</span>`,
    "</a>",
  ];
  const link = (href, name, attrs) => [
    `<NButton as="a" href="${href}" target="_blank" rel="noopener" size="lg"${attrs}>`,
    `  ${name}`,
    "</NButton>",
  ];
  const links = o.ui
    ? [
        `<div${cls("mt-10 flex flex-wrap items-center justify-center gap-3")}>`,
        indent(
          link(
            "https://liorcodev.github.io/noofpi-docs/",
            tx("home.docs", "Documentation"),
            ' trailing-icon="i-lucide-arrow-right"',
          ),
          2,
        ),
        indent(
          link(
            "https://github.com/liorcodev/noofpi",
            tx("home.github", "GitHub"),
            ' variant="outline" icon="i-lucide-star"',
          ),
          2,
        ),
        "</div>",
      ]
    : [
        `<div${cls("mt-12 grid w-full max-w-4xl gap-4 sm:grid-cols-3", "cards")}>`,
        indent(
          card(
            "https://liorcodev.github.io/noofpi-docs/",
            tx("home.docs", "Documentation"),
            tx("home.docsText", HOME_MESSAGES.docsText),
          ),
          2,
        ),
        indent(
          card(
            "https://liorcodev.github.io/noofpi-ui-docs/",
            "noofpi-ui",
            tx("home.uiText", UI_CARD_TEXT),
          ),
          2,
        ),
        indent(
          card(
            "https://github.com/liorcodev/noofpi",
            tx("home.github", "GitHub"),
            tx("home.githubText", HOME_MESSAGES.githubText),
          ),
          2,
        ),
        "</div>",
      ];
  const badge = o.ui
    ? [
        `<NBadge variant="subtle" pill class="mt-8">`,
        `  ${tx("home.mode", "Fetch mode")}: <b class="font-mono">${o.fetch}</b>`,
        "</NBadge>",
      ]
    : [
        `<p${cls("mt-8 rounded-full border border-gray-500/25 px-3 py-1 text-xs text-gray-500", "badge")}>`,
        `  ${tx("home.mode", "Fetch mode")}: <b${cls("font-mono text-emerald-600")}>${o.fetch}</b>`,
        "</p>",
      ];
  const content = [
    `<img :src="logo" alt="${o.name}"${cls("h-20 w-20 drop-shadow-lg", "logo")} />`,
    `<h1${cls("mt-8 text-5xl font-extrabold tracking-tight sm:text-6xl")}>`,
    `  ${tx("home.welcome", "Welcome to")}`,
    `  <span${cls("bg-linear-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent", "gradient")}>noofpi</span>`,
    "</h1>",
    `<p${cls("mt-4 text-lg text-gray-500", "hint")}>`,
    `  ${tx("home.edit", "Get started by editing")} <code${cls("rounded-md bg-gray-500/10 px-2 py-0.5 font-mono text-emerald-600")}>app/pages/index.vue</code>`,
    "</p>",
    ...links,
    ...badge,
  ];
  return sfc(script, "div", cls("min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"), shell(o, content));
}

function layout(o) {
  const { cls } = helpers(o);
  const script = o.i18n
    ? [
        "const { locale, setLocale } = useI18n();",
        `const locales = ${list(o.locales)} as const;`,
      ]
    : [];
  const body = [];
  if (o.i18n)
    body.push(
      `<div${cls("absolute top-4 right-4 z-10 flex gap-2 text-sm", "locales")}>`,
      `  <button v-for="l in locales" :key="l" :disabled="l === locale"${cls("cursor-pointer uppercase disabled:font-bold disabled:text-emerald-600")} @click="setLocale(l)">`,
      "    {{ l }}",
      "  </button>",
      "</div>",
    );
  body.push("<slot />");
  return sfc(script, "div", cls("relative"), body);
}

function errorPage(o) {
  const { cls, tx } = helpers(o);
  const script = [
    'import type { NoofpiErrorData } from "noofpi/runtime";',
    "",
    "defineProps<{ error: NoofpiErrorData }>();",
    "",
    'const goHome = () => clearError({ redirect: "/" });',
  ];
  const content = [
    `<p${cls("text-8xl font-extrabold leading-none sm:text-9xl", "error-code")}>{{ error.statusCode }}</p>`,
    `<p${cls("mt-4 text-lg text-gray-500", "hint")}>{{ error.message }}</p>`,
    o.ui
      ? `<NButton size="lg" class="mt-8" @click="goHome">${tx("error.back", "Back home")}</NButton>`
      : `<button${cls("mt-8 cursor-pointer rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-700", "back")} @click="goHome">${tx("error.back", "Back home")}</button>`,
  ];
  const wrapper = cls("min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100");
  return `<script setup lang="ts">\n${script.join("\n")}\n</script>\n\n<template>\n  <NoofpiLayout>\n    <div${wrapper}>\n${indent(shell(o, content), 6)}\n    </div>\n  </NoofpiLayout>\n</template>\n`;
}

function testFile(o) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import config from "../noofpi.config";`,
    "",
    `describe("noofpi.config", () => {`,
    `  it("uses the ${o.fetch} fetch mode", () => {`,
    `    expect(config.doofpi?.fetch).toBe("${o.fetch}");`,
    "  });",
    "});",
    "",
  ].join("\n");
}

const LOCK_FILES = {
  bun: "bun.lock*",
  pnpm: "pnpm-lock.yaml*",
  yarn: "yarn.lock*",
  npm: "package-lock.json*",
};

function dockerfile(o) {
  const remote = o.fetch !== "lfetch";
  const bun = o.pm === "bun";
  return [
    bun ? "FROM oven/bun:1" : "FROM node:22-slim",
    "WORKDIR /app",
    ...(o.pm === "pnpm" || o.pm === "yarn" ? ["RUN corepack enable"] : []),
    "",
    `COPY package.json ${LOCK_FILES[o.pm]} ./`,
    `RUN ${o.pm} install`,
    "",
    "COPY . .",
    ...(remote
      ? ["# The doofpi URL is baked into the build", `ARG DOOFPI_URL=${o.url}`, "ENV DOOFPI_URL=$DOOFPI_URL"]
      : []),
    `RUN ${script(o, "build", `--preset ${bun ? "bun" : "node"}`)}`,
    "",
    `ENV NODE_ENV=production PORT=${o.port} HOST=0.0.0.0`,
    `EXPOSE ${o.port}`,
    `CMD ["${bun ? "bun" : "node"}", ".output/server/start.mjs"]`,
    "",
  ].join("\n");
}

// Steps that make the package manager available on a GitHub Actions runner
function setupSteps(o) {
  if (o.pm === "bun") return ["      - uses: oven-sh/setup-bun@v2"];
  return [
    ...(o.pm === "pnpm"
      ? ["      - uses: pnpm/action-setup@v4", "        with:", "          version: 10"]
      : []),
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
  ];
}

const doofpiEnv = (indent) => [
  `${indent}DOOFPI_URL: \${{ vars.DOOFPI_URL || '${DEFAULT_URL}' }}`,
];

function workflow(o) {
  const remote = o.fetch !== "lfetch";
  return [
    "name: CI",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "",
    "jobs:",
    "  check:",
    "    runs-on: ubuntu-latest",
    ...(remote ? ["    env:", ...doofpiEnv("      ")] : []),
    "    steps:",
    "      - uses: actions/checkout@v4",
    ...setupSteps(o),
    `      - run: ${o.pm} install`,
    ...(o.eslint ? [`      - run: ${script(o, "lint")}`] : []),
    `      - run: ${script(o, "build")}`,
    `      - run: ${script(o, "typecheck")}`,
    ...(o.test ? [`      - run: ${script(o, "test")}`] : []),
    "",
  ].join("\n");
}

function pagesWorkflow(o) {
  return [
    "name: Deploy to GitHub Pages",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "  pages: write",
    "  id-token: write",
    "",
    "concurrency:",
    "  group: pages",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    env:",
    ...doofpiEnv("      "),
    "      # Remove for a user or organization site (<name>.github.io)",
    "      BASE_PATH: /${{ github.event.repository.name }}/",
    "    steps:",
    "      - uses: actions/checkout@v4",
    ...setupSteps(o),
    `      - run: ${o.pm} install`,
    `      - run: ${script(o, "build")}`,
    "      - uses: actions/configure-pages@v5",
    "      - uses: actions/upload-pages-artifact@v3",
    "        with:",
    "          path: .output/public",
    "",
    "  deploy:",
    "    runs-on: ubuntu-latest",
    "    needs: build",
    "    environment:",
    "      name: github-pages",
    "      url: ${{ steps.deployment.outputs.page_url }}",
    "    steps:",
    "      - id: deployment",
    "        uses: actions/deploy-pages@v4",
    "",
  ].join("\n");
}

function readme(o) {
  const remote = o.fetch !== "lfetch";
  const serverless = ["cloudflare-worker", "cloudflare-pages", "github-pages"].includes(o.preset);
  const lines = [
    `# ${o.name}`,
    "",
    "A [noofpi](https://liorcodev.github.io/noofpi-docs/) app.",
    "",
    "## Scripts",
    "",
    "| Script | Description |",
    "| --- | --- |",
    `| \`${script(o, "dev")}\` | Start the dev server |`,
    `| \`${script(o, "build")}\` | Build into \`.output/\` (target: \`${o.preset}\`) |`,
    ...(serverless ? [] : [`| \`${script(o, "start")}\` | Run the build |`]),
    `| \`${script(o, "typecheck")}\` | Type-check with \`vue-tsc\` (run \`dev\` or \`build\` once first) |`,
  ];
  if (o.test) lines.push(`| \`${script(o, "test")}\` | Run the tests with Vitest |`);
  if (o.eslint) lines.push(`| \`${script(o, "lint")}\` | Lint the code with ESLint |`);
  if (o.prettier)
    lines.push(
      `| \`${script(o, "format")}\` | Format the code with Prettier |`,
      `| \`${script(o, "format:check")}\` | Check the formatting |`,
    );
  if (o.preset.startsWith("cloudflare-"))
    lines.push(
      `| \`${script(o, "types")}\` | Generate binding types (\`worker-configuration.d.ts\`), rerun after editing \`wrangler.json\` |`,
      `| \`${script(o, "deploy")}\` | Build and deploy with Wrangler |`,
    );

  lines.push(
    "",
    "## Fetch mode",
    "",
    `\`${o.fetch}\`: ${FETCH_MODES[o.fetch]}.`,
    "",
  );
  if (remote)
    lines.push(
      "The remote API is set with `DOOFPI_URL` in `.env` (see `.env.example`). The URL is baked in at build time.",
      "",
    );
  if (o.fetch === "pfetch")
    lines.push(
      "Add auth or short-circuit requests in `server/proxy.ts`.",
      "",
    );
  if (o.fetch === "sfetch")
    lines.push(
      "`sfetch` never fetches from the browser, so data is only available on the first, server-rendered page load.",
      "",
    );

  lines.push("## Structure", "", "```text");
  lines.push("noofpi.config.ts");
  lines.push("app/");
  lines.push("  pages/         file routes");
  if (o.template === "starter") {
    lines.push("  layouts/       default.vue wraps every page");
    lines.push("  middleware/    route middleware");
    lines.push("  components/    auto-imported components");
    lines.push("  composables/   auto-imported composables");
    lines.push("  utils/         auto-imported helpers");
    lines.push("  error.vue      404 and error page");
  }
  if (o.i18n) lines.push("  locales/       one file per locale");
  if (o.ui) lines.push("  assets/theme.css  Color Theme Studio colors for noofpi-ui");
  lines.push("public/          static files");
  if (o.fetch === "lfetch") lines.push("server/doofpi.ts  your doofpi API");
  if (o.fetch === "pfetch") lines.push("server/proxy.ts   pfetch proxy hook");
  lines.push("```", "");

  if (o.ui)
    lines.push(
      "## noofpi-ui",
      "",
      "The `N*` components (`NButton`, `NCard`, ...) are auto-imported by the plugin in `noofpi.config.ts`. Colors come from `app/assets/theme.css` (a [Color Theme Studio](https://liorcodev.github.io/color-theme-studio) export); override `--ui-*` variables in `app/assets/main.css`. See the [noofpi-ui docs](https://liorcodev.github.io/noofpi-ui-docs/).",
      "",
    );

  if (o.preset === "github-pages")
    lines.push(
      "## GitHub Pages",
      "",
      "The `github-pages` preset builds a static, client-only SPA into `.output/public`. `.github/workflows/deploy.yml` publishes it on every push to `main`: enable Pages with the **GitHub Actions** source in the repository settings.",
      "",
      "A project site is served from `/<repo>/`, so the workflow sets `BASE_PATH`. Remove it for a user or organization site.",
      "",
    );
  if (o.preset === "cloudflare-worker")
    lines.push(
      "## Cloudflare",
      "",
      `\`${script(o, "deploy")}\` builds the Worker and deploys it with Wrangler. Edit \`wrangler.json\` to add bindings, routes or a custom name.`,
      "",
    );
  if (o.preset === "cloudflare-pages")
    lines.push(
      "## Cloudflare",
      "",
      `\`${script(o, "deploy")}\` builds and deploys to Cloudflare Pages with Wrangler. Edit \`wrangler.json\` to add bindings; it already sets the \`nodejs_compat\` flag.`,
      "",
    );

  if (o.docker) {
    const image = o.name;
    lines.push("## Docker", "", "```bash");
    if (o.preset === "docker")
      lines.push(
        script(o, "build"),
        `docker build -f .output/Dockerfile -t ${image} .`,
      );
    else
      lines.push(
        remote
          ? `docker build --build-arg DOOFPI_URL=https://api.example.com -t ${image} .`
          : `docker build -t ${image} .`,
      );
    lines.push(`docker run -p ${o.port}:${o.port} ${image}`, "```", "");
  }
  return lines.join("\n");
}
