import {
  cpSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_URL, FETCH_MODES } from "./options.mjs";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function generateProject(options, target) {
  const extras = [
    options.template === "starter" && "starter",
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
    files.set("app/pages/about.vue", aboutPage(o));
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
  if (o.docker) files.set("Dockerfile", dockerfile(o));
  if (o.ci) files.set(".github/workflows/ci.yml", workflow(o));
  return files;
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
  if (o.prettier) {
    scripts.format = "prettier --write .";
    scripts["format:check"] = "prettier --check .";
  }
  const dependencies = { doofpi: "^1.3.1", noofpi: "^1.0.0", vue: "^3.5.45" };
  if (o.fetch === "lfetch") dependencies.zod = "^4.6.7";
  const devDependencies = {
    "@types/node": "^24.19.2",
    typescript: "~6.0.3",
    "vue-tsc": "^3.3.14",
  };
  if (o.prettier) devDependencies.prettier = "^3.10.1";
  if (o.test) devDependencies.vitest = "^4.1.12";
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
  const lines = [
    `import { defineNoofpiConfig } from "noofpi";`,
    "",
    "export default defineNoofpiConfig({",
    `  ssr: ${o.ssr},`,
    `  tailwind: ${o.tailwind},`,
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
}

main {
  max-width: 36rem;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  margin: 0;
}

.hint {
  color: gray;
}

.error {
  color: crimson;
}
`;

const PLAIN_STARTER_CSS = `
header {
  border-bottom: 1px solid #8884;
}

nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 36rem;
  margin: 0 auto;
  padding: 1rem;
}

nav .locales {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

section {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid #8884;
  border-radius: 0.5rem;
}

footer {
  padding: 1rem;
  color: gray;
  font-size: 0.875rem;
  text-align: center;
}
`;

function mainCss(o) {
  if (o.tailwind) return '@import "tailwindcss";\n';
  return PLAIN_CSS + (o.template === "starter" ? PLAIN_STARTER_CSS : "");
}

const MESSAGES = {
  minimal: {
    home: {
      title: "Home",
      hint: "Edit app/pages/index.vue to get started.",
    },
  },
  starter: {
    nav: { about: "About" },
    home: {
      title: "Home",
      hint: "Edit app/pages/index.vue to get started.",
      loading: "Loading...",
      reload: "Reload",
    },
    about: {
      title: "About",
      text: "A noofpi app with SSR, a doofpi API and file-based routes.",
    },
    error: { back: "Back home" },
  },
};

const messagesFor = (o) => MESSAGES[o.template];

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
    const value = o.tailwind ? tailwind : plain;
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

function indexPage(o) {
  const starter = o.template === "starter";
  const { cls, tx, title } = helpers(o);
  const script = [];
  if (o.i18n) script.push("const { t } = useI18n();");
  script.push(title("home.title", "Home"));
  if (starter) {
    script.push("");
    if (o.fetch !== "lfetch")
      script.push(
        '// "hello" is an example, replace it with an endpoint of your API.',
        "// The client is untyped until you register the API's routes.",
      );
    script.push(
      "const { data, error, pending, refresh } = useDoofpiFetch(",
      '  "hello",',
      o.fetch === "lfetch"
        ? "  (client) => client.hello.read(),"
        : "  (client: any) => client.hello.read(),",
      ");",
    );
  }

  const body = [
    `<h1${cls("text-3xl font-bold")}>${o.name}</h1>`,
    `<p${cls("mt-2 text-gray-600", "hint")}>${tx("home.hint", "Edit app/pages/index.vue to get started.")}</p>`,
  ];
  if (starter)
    body.push(
      `<section${cls("mt-6 rounded border border-gray-200 p-4")}>`,
      `  <p v-if="pending">${tx("home.loading", "Loading...")}</p>`,
      `  <p v-else-if="error"${cls("text-red-600", "error")}>{{ error.message }}</p>`,
      `  <p v-else>{{ ${o.fetch === "lfetch" ? "data?.message" : "data"} }}</p>`,
      `  <button${cls("mt-3 rounded bg-gray-900 px-3 py-1 text-white")} @click="refresh()">`,
      `    ${tx("home.reload", "Reload")}`,
      "  </button>",
      "</section>",
    );
  return starter
    ? sfc(script, "div", "", body)
    : sfc(script, "main", cls("mx-auto max-w-xl p-8"), body);
}

function aboutPage(o) {
  const { cls, tx, title } = helpers(o);
  const script = [];
  if (o.i18n) script.push("const { t } = useI18n();");
  script.push(title("about.title", "About"));
  return sfc(script, "div", "", [
    `<h1${cls("text-3xl font-bold")}>${tx("about.title", "About")}</h1>`,
    `<p${cls("mt-2 text-gray-600", "hint")}>${tx("about.text", MESSAGES.starter.about.text)}</p>`,
  ]);
}

function layout(o) {
  const { cls, tx } = helpers(o);
  const script = o.i18n
    ? [
        "const { locale, setLocale } = useI18n();",
        `const locales = ${list(o.locales)} as const;`,
      ]
    : [];
  const nav = [
    `<NoofpiLink to="/"${cls("font-bold")}>${o.name}</NoofpiLink>`,
    `<NoofpiLink to="/about"${cls("text-gray-600 hover:text-gray-900")}>${tx("nav.about", "About")}</NoofpiLink>`,
  ];
  if (o.i18n)
    nav.push(
      `<div${cls("ml-auto flex gap-2", "locales")}>`,
      '  <button v-for="code in locales" :key="code" :disabled="code === locale" @click="setLocale(code)">',
      "    {{ code }}",
      "  </button>",
      "</div>",
    );
  const body = [
    `<header${cls("border-b border-gray-200")}>`,
    `  <nav${cls("mx-auto flex max-w-xl items-center gap-4 p-4")}>`,
    indent(nav, 4),
    "  </nav>",
    "</header>",
    `<main${cls("mx-auto w-full max-w-xl flex-1 p-8")}><slot /></main>`,
    `<footer${cls("border-t border-gray-200 p-4 text-center text-sm text-gray-500")}>Built with noofpi</footer>`,
  ];
  return sfc(script, "div", cls("flex min-h-screen flex-col"), body);
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
  const body = [
    `<h1${cls("text-3xl font-bold")}>{{ error.statusCode }}</h1>`,
    `<p${cls("mt-2 text-gray-600", "hint")}>{{ error.message }}</p>`,
    `<button${cls("mt-4 underline")} @click="goHome">${tx("error.back", "Back home")}</button>`,
  ];
  return `<script setup lang="ts">\n${script.join("\n")}\n</script>\n\n<template>\n  <NoofpiLayout>\n    <div>\n${indent(body, 6)}\n    </div>\n  </NoofpiLayout>\n</template>\n`;
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

function dockerfile(o) {
  const remote = o.fetch !== "lfetch";
  return [
    "FROM oven/bun:1",
    "WORKDIR /app",
    "",
    "COPY package.json bun.lock* ./",
    "RUN bun install",
    "",
    "COPY . .",
    ...(remote
      ? ["# The doofpi URL is baked into the build", `ARG DOOFPI_URL=${o.url}`, "ENV DOOFPI_URL=$DOOFPI_URL"]
      : []),
    "RUN bun run build --preset bun",
    "",
    "ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0",
    "EXPOSE 3000",
    'CMD ["bun", ".output/server/start.mjs"]',
    "",
  ].join("\n");
}

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
    ...(remote
      ? [
          "    env:",
          `      DOOFPI_URL: \${{ vars.DOOFPI_URL || '${DEFAULT_URL}' }}`,
        ]
      : []),
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: oven-sh/setup-bun@v2",
    "      - run: bun install",
    "      - run: bun run build",
    "      - run: bun run typecheck",
    ...(o.test ? ["      - run: bun run test"] : []),
    "",
  ].join("\n");
}

function readme(o) {
  const remote = o.fetch !== "lfetch";
  const lines = [
    `# ${o.name}`,
    "",
    "A [noofpi](https://liorcodev.github.io/noofpi-docs/) app.",
    "",
    "## Scripts",
    "",
    "| Script | Description |",
    "| --- | --- |",
    "| `bun dev` | Start the dev server |",
    "| `bun run build` | Build into `.output/` |",
    "| `bun run start` | Run the build |",
    "| `bun run typecheck` | Type-check with `vue-tsc` (run `bun dev` or `bun run build` once first) |",
  ];
  if (o.test) lines.push("| `bun run test` | Run the tests with Vitest |");
  if (o.prettier)
    lines.push(
      "| `bun run format` | Format the code with Prettier |",
      "| `bun run format:check` | Check the formatting |",
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
    lines.push("  error.vue      404 and error page");
  }
  if (o.i18n) lines.push("  locales/       one file per locale");
  lines.push("public/          static files");
  if (o.fetch === "lfetch") lines.push("server/doofpi.ts  your doofpi API");
  if (o.fetch === "pfetch") lines.push("server/proxy.ts   pfetch proxy hook");
  lines.push("```", "");

  if (o.docker)
    lines.push(
      "## Docker",
      "",
      "```bash",
      remote
        ? "docker build --build-arg DOOFPI_URL=https://api.example.com -t " + o.name + " ."
        : "docker build -t " + o.name + " .",
      `docker run -p 3000:3000 ${o.name}`,
      "```",
      "",
    );
  return lines.join("\n");
}
