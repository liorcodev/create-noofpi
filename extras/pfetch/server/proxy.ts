import type { ProxyHook } from "noofpi/server";

// add auth, or return a Response to short-circuit
export default (({ request, headers }) => {
  headers.set("authorization", "Bearer ...");
}) satisfies ProxyHook;
