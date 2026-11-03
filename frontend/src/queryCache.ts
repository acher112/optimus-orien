/**
 * High-performance client-side query cache for OPTIMUS ORIEN.
 * Provides stale-while-revalidate caching, in-flight promise deduplication,
 * and scope-based cache invalidation for frontend views.
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttlMs: number;
};

class ClientQueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();

  /**
   * Fetch with stale-while-revalidate caching.
   * If fresh data exists in cache, returns immediately.
   * Deduplicates concurrent inflight requests for the identical key.
   */
  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttlMs?: number; forceRefresh?: boolean } = {}
  ): Promise<T> {
    const { ttlMs = 60_000, forceRefresh = false } = options;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && now - cached.timestamp < cached.ttlMs) {
        return cached.data as T;
      }
    }

    // Inflight request deduplication
    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<T>;
    }

    const requestPromise = fetcher()
      .then((data) => {
        this.cache.set(key, { data, timestamp: Date.now(), ttlMs });
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, requestPromise);
    return requestPromise;
  }

  /** Invalidate all entries matching a prefix or scope (e.g. 'dashboard', 'students') */
  invalidate(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Clear entire client cache upon logout or tenant switch */
  clear() {
    this.cache.clear();
    this.inflight.clear();
  }
}

export const queryCache = new ClientQueryCache();
