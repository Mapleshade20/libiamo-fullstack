import { z } from "zod";

// zod compiles parsers with `new Function` when it may; the page's Content-Security-Policy forbids it (vite.config.ts),
// and zod's probe for that is reported as a violation even though it is caught. In the browser it never tries.
z.config({ jitless: true });
