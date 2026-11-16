import Doofpi from "doofpi";
import { z } from "zod";

const d = new Doofpi({ root: "/doofpi" });

// `useDoofpi()` and `useDoofpiFetch()` are typed by this export
export const routes = d.routes({
  hello: d.endpointBuilder
    .model({ output: z.object({ message: z.string() }) })
    .read(() => ({ message: "Hello from doofpi" })),
});

d.register(routes);

export default d;
