import type { RelayShard } from '../src/relay-shard';

declare global {
  namespace Cloudflare {
    interface Env {
      ASSETS: Fetcher;
      RELAY: DurableObjectNamespace<RelayShard>;
    }
  }
}
