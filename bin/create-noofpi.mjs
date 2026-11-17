#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateProject } from "../lib/generate.mjs";
import {
  parseArgs,
  resolveOptions,
  toPackageName,
  USAGE,
} from "../lib/options.mjs";
import { dim, green, intro, note, outro, step } from "../lib/ui.mjs";
import { readFileSync } from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

let options;
try {
  const { values, positional } = parseArgs(process.argv.slice(2));
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  intro(version());
  options = await resolveOptions(values, positional);
} catch (error) {
  fail(error.message);
}

const target = path.resolve(options.name);
const packageName = toPackageName(path.basename(target));
options.name = packageName;

generateProject(options, target);

const pm = options.pm;
const run = pm === "npm" ? "npm run" : pm;
const relative = path.relative(process.cwd(), target);
step(`Created ${green(packageName)} ${dim(`in ${target}`)}`);

let installed = false;
if (options.install) {
  step(`Installing dependencies with ${pm}`);
  installed =
    spawnSync(pm, ["install"], {
      cwd: target,
      stdio: "inherit",
      shell: process.platform === "win32",
    }).status === 0;
  if (!installed) console.error(`${pm} install failed, run it yourself.`);
}
const cloudflare = options.preset.startsWith("cloudflare-");
let typed = false;
if (installed && cloudflare) {
  step("Generating binding types with wrangler");
  typed =
    spawnSync(pm, ["run", "types"], {
      cwd: target,
      stdio: "inherit",
      shell: process.platform === "win32",
    }).status === 0;
  if (!typed) console.error(`${run} types failed, run it yourself.`);
}
if (options.git && !insideGitRepo(target)) {
  spawnSync("git", ["init"], { cwd: target, stdio: "ignore" });
}

const steps = [
  ...(relative ? [`cd ${relative}`] : []),
  ...(installed ? [] : [`${pm} install`]),
  ...(cloudflare && !typed ? [`${run} types`] : []),
  `${run} dev`,
];
note("Next steps", steps);
if (options.fetch !== "lfetch")
  console.log(
    `${dim("│")}  ${dim(`Remote API URL is in .env (DOOFPI_URL): ${options.url}`)}`,
  );
outro(green("Happy hacking!"));
function insideGitRepo(cwd) {
  return (
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: "ignore",
    }).status === 0
  );
}

function version() {
  try {
    const url = new URL("../package.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf-8")).version;
  } catch {
    return "";
  }
}
