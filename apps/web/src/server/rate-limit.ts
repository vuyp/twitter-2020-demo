import { rateLimited } from './errors';

type Bucket = { count: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

/** A process-local guard; production deployments can replace this with Redis without changing handlers. */
export function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): void {
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return;
  }
  if (current.count >= limit) rateLimited(Math.max(1, Math.ceil((current.resetsAt - now) / 1000)));
  current.count += 1;

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets)
      if (bucket.resetsAt <= now) buckets.delete(bucketKey);
  }
}
