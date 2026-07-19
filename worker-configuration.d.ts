// Ambient type augmentation for the Cloudflare Workers runtime env used via
// `import { env } from "cloudflare:workers"` (see db/index.ts). Keep this in
// sync with the bindings declared in wrangler config / worker/index.ts's Env.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
