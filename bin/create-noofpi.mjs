#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateProject } from "../lib/generate.mjs";
import { parseArgs, resolveOptions, USAGE } from "../lib/options.mjs";
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

if (!/^[a-z0-9][a-z0-9._-]*$/.test(packageName)) {
  fail(`"${path.basename(target)}" is not a valid project name.`);
}
if (existsSync(target) && readdirSync(target).length > 0 && !options.force) {
  fail(
    `${target} is not empty. Pick another name or pass --force to write into it.`,
  );
}

generateProject(options, target);

const pm = packageManager();
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
if (options.git && !insideGitRepo(target)) {
  spawnSync("git", ["init"], { cwd: target, stdio: "ignore" });
}

const steps = [
  ...(relative ? [`cd ${relative}`] : []),
  ...(installed ? [] : [`${pm} install`]),
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

function toPackageName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]+/, "")
    .replace(/[^a-z0-9._-]+/g, "-");
}

function packageManager() {
  const agent = process.env.npm_config_user_agent ?? "";
  for (const pm of ["bun", "pnpm", "yarn"]) {
    if (agent.startsWith(pm)) return pm;
  }
  return agent.startsWith("npm") ? "npm" : "bun";
}

function version() {
  try {
    const url = new URL("../package.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf-8")).version;
  } catch {
    return "";
  }
}