// Logs every request with its response status while developing. Delete this file to turn it off.
import { defineServerMiddleware } from "noofpi/server";

const c = (code: string, text: string) => `\x1b[${code}m${text}\x1b[0m`;
const time = () => new Date().toLocaleTimeString([], { hour12: false });

const statusColor = (status: number) =>
  status >= 500
    ? "1;31"
    : status >= 400
      ? "1;33"
      : status >= 300
        ? "36"
        : "1;32";

export default defineServerMiddleware(async ({ request, url }, next) => {
  if (!import.meta.env.DEV) return next();

  const start = performance.now();
  const response = await next();
  const ms = Math.round(performance.now() - start);

  console.log(
    `${c("1;38;2;52;211;153", "◆ noofpi")}  ${c("2", time())}  ${c(statusColor(response.status), String(response.status))}  ${request.method} ${c("1", url.pathname + url.search)}  ${c("2", `${ms}ms`)}`,
  );
  return response;
});
