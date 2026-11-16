import readline from "node:readline";

const LOGO = ["█▄ █  █▀█  █▀█  █▀▀  █▀█  █", "█ ▀█  █▄█  █▄█  █▀   █▀▀  █"];

const useColor =
  !process.env.NO_COLOR &&
  (Boolean(process.env.FORCE_COLOR) || Boolean(process.stdout.isTTY));
const trueColor =
  useColor &&
  (process.env.COLORTERM === "truecolor" ||
    process.env.COLORTERM === "24bit" ||
    Boolean(process.env.WT_SESSION) ||
    process.env.TERM_PROGRAM === "vscode");

const wrap = (open, close) => (text) =>
  useColor ? `\x1b[${open}m${text}\x1b[${close}m` : String(text);
export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const cyan = wrap("36", "39");

// Green -> cyan -> violet, same as the noofpi dev banner
const STOPS = [
  [52, 211, 153],
  [56, 189, 248],
  [167, 139, 250],
];

function gradientAt(t) {
  const scaled = t * (STOPS.length - 1);
  const index = Math.min(Math.floor(scaled), STOPS.length - 2);
  const local = scaled - index;
  const [r1, g1, b1] = STOPS[index];
  const [r2, g2, b2] = STOPS[index + 1];
  const mix = (a, b) => Math.round(a + (b - a) * local);
  return [mix(r1, r2), mix(g1, g2), mix(b1, b2)];
}

function gradient(text) {
  if (!trueColor) return useColor ? cyan(text) : text;
  const last = Math.max(text.length - 1, 1);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const [r, g, b] = gradientAt(i / last);
    out += `\x1b[38;2;${r};${g};${b}m${text[i]}`;
  }
  return out + "\x1b[39m";
}

const BAR = dim("│");
const fit = (text, width) =>
  text.length > width ? text.slice(0, Math.max(width - 1, 0)) + "…" : text;
const columns = () => (process.stdout.columns || 80) - 1;

export function intro(version) {
  const meta = ["create-noofpi", version].filter(Boolean).join(" ");
  console.log(
    [
      "",
      ...LOGO.map((line) => "  " + gradient(line)),
      "",
      "  " + dim(meta),
      "",
      `${dim("┌")}  ${bold("Let's scaffold your app")}`,
      BAR,
    ].join("\n"),
  );
}

export function step(message) {
  console.log(`${green("◇")}  ${message}\n${BAR}`);
}

export function note(title, lines) {
  const inner = Math.max(title.length + 4, ...lines.map((l) => l.length + 4));
  const empty = `${BAR}${" ".repeat(inner)}${dim("│")}`;
  const body = lines.map(
    (line) => `${BAR}  ${line}${" ".repeat(inner - line.length - 2)}${dim("│")}`,
  );
  console.log(
    [
      `${dim("├─")} ${bold(title)} ${dim("─".repeat(inner - title.length - 3) + "╮")}`,
      empty,
      ...body,
      empty,
      dim("├" + "─".repeat(inner) + "╯"),
    ].join("\n"),
  );
}

export function outro(message) {
  console.log(`${dim("└")}  ${message}\n`);
}

export function cancel(message = "Cancelled") {
  console.log(`${dim("└")}  ${red(message)}\n`);
}

// Runs one interactive prompt. `render(state, done)` returns the lines to draw,
// `onKey(state, key)` mutates the state and returns true when the prompt is finished.
function run(state, render, onKey) {
  return new Promise((resolve) => {
    const input = process.stdin;
    let drawn = 0;

    const draw = (done) => {
      if (drawn) process.stdout.write(`\x1b[${drawn}A\r\x1b[0J`);
      const lines = render(state, done);
      process.stdout.write(lines.join("\n") + "\n");
      drawn = lines.length;
    };

    const finish = () => {
      input.off("keypress", handler);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\x1b[?25h");
    };

    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === "c") {
        finish();
        process.stdout.write("\n");
        cancel();
        process.exit(130);
      }
      if (onKey(state, key, str)) {
        draw(true);
        finish();
        resolve(state.result());
      } else draw(false);
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write("\x1b[?25l");
    input.on("keypress", handler);
    draw(false);
  });
}

export function createPrompter() {
  return {
    text(message, fallback) {
      const state = { value: "", result: () => state.value.trim() || fallback };
      return run(
        state,
        (s, done) => {
          const head = `${done ? green("◇") : cyan("◆")}  ${bold(message)}`;
          const shown = s.value
            ? fit(s.value, columns() - 5)
            : dim(fit(fallback, columns() - 5));
          const cursor = done ? "" : cyan("▍");
          const body = done
            ? s.result()
            : s.value
              ? shown + cursor
              : cursor + shown;
          return [head, `${BAR}  ${done ? dim(body) : body}`, BAR];
        },
        (s, key, str) => {
          if (key.name === "return") return true;
          if (key.name === "backspace") s.value = s.value.slice(0, -1);
          else if (
            str &&
            !key.ctrl &&
            !key.meta &&
            str >= " " &&
            str !== "\x7f"
          )
            s.value += str;
          return false;
        },
      );
    },

    confirm(message, fallback) {
      const state = { value: fallback, result: () => state.value };
      return run(
        state,
        (s, done) => {
          const head = `${done ? green("◇") : cyan("◆")}  ${bold(message)}`;
          if (done) return [head, `${BAR}  ${dim(s.value ? "Yes" : "No")}`, BAR];
          const yes = s.value ? `${green("●")} Yes` : dim("○ Yes");
          const no = s.value ? dim("○ No") : `${green("●")} No`;
          return [head, `${BAR}  ${yes} ${dim("/")} ${no}`, BAR];
        },
        (s, key, str) => {
          if (key.name === "return") return true;
          if (["left", "right", "up", "down", "tab"].includes(key.name))
            s.value = !s.value;
          else if (str === "y" || str === "Y") s.value = true;
          else if (str === "n" || str === "N") s.value = false;
          return false;
        },
      );
    },

    select(message, choices, fallback) {
      const names = Object.keys(choices);
      const state = {
        index: Math.max(names.indexOf(fallback), 0),
        result: () => names[state.index],
      };
      const pad = Math.max(...names.map((n) => n.length));
      return run(
        state,
        (s, done) => {
          const head = `${done ? green("◇") : cyan("◆")}  ${bold(message)}`;
          if (done) return [head, `${BAR}  ${dim(names[s.index])}`, BAR];
          const rows = names.map((name, i) => {
            if (i !== s.index) return `${BAR}  ${dim("○ " + name)}`;
            const hint = fit(choices[name], columns() - pad - 8);
            return `${BAR}  ${green("●")} ${bold(name.padEnd(pad))}  ${dim(hint)}`;
          });
          return [head, ...rows, BAR];
        },
        (s, key, str) => {
          if (key.name === "return") return true;
          if (key.name === "up" || key.name === "left")
            s.index = (s.index - 1 + names.length) % names.length;
          else if (key.name === "down" || key.name === "right" || key.name === "tab")
            s.index = (s.index + 1) % names.length;
          else if (str >= "1" && str <= String(names.length))
            s.index = Number(str) - 1;
          return false;
        },
      );
    },

    close() {},
  };
}
