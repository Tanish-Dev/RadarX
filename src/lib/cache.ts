/**
 * Shared read cache for public traffic: one database read per minute per distinct query instead of one per
 * visitor (Turso's free tier bills reads). Owner actions call revalidateTag("db") so their changes show at once.
 * Results must be JSON-serialisable.
 */
import { unstable_cache } from "next/cache";

export function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>, revalidate = 60): (...args: A) => Promise<R> {
  // outside a Next.js request (tests, worker scripts) there is no incremental cache — call straight through
  const wrapped = unstable_cache(fn, ["rx", name], { revalidate, tags: ["db"] });
  return async (...args: A) => {
    try {
      return await wrapped(...args);
    } catch (e) {
      if (e instanceof Error && /incrementalCache|static generation store|Invariant/i.test(e.message)) return fn(...args);
      throw e;
    }
  };
}
