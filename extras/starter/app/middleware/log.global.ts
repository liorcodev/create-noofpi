// Logs each navigation while developing. Delete this file to turn it off.
const time = () => new Date().toLocaleTimeString([], { hour12: false });

export default defineRouteMiddleware((to, from) => {
  if (!import.meta.env.DEV) return;

  const ssr = import.meta.env.SSR;
  const label = ssr ? "SSR" : "CSR";
  const origin = from.name ? from.fullPath : "";

  if (ssr) {
    const c = (code: string, text: string) => `\x1b[${code}m${text}\x1b[0m`;
    const arrow = origin ? `${c("2", origin)} ${c("2", "→")} ` : "";
    console.log(
      `${c("1;38;2;52;211;153", "◆ noofpi")}  ${c("2", time())}  ${c("38;2;56;189;248", label)}  ${arrow}${c("1", to.fullPath)}`,
    );
    return;
  }

  const pill = (color: string) =>
    `background:${color};color:#fff;font-weight:700;border-radius:4px;padding:1px 6px`;
  console.log(
    `%c◆ noofpi%c ${time()} %c${label}%c ${origin ? `${origin} → ` : ""}%c${to.fullPath}`,
    pill("#10b981"),
    "color:#9ca3af",
    pill("#a78bfa"),
    "color:#9ca3af",
    "font-weight:700",
  );
});
