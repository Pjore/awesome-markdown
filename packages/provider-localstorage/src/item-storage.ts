import type { Item } from '@awesome-markdown/contracts';

export async function revisionOf(item: Item): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(item));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

let tail: Promise<unknown> = Promise.resolve();
/** Web Locks coordinate tabs; the fallback serializes all provider instances in this realm. */
export function storageLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request('awesome-markdown:v2', work).then((value) => value);
  const next = tail.then(work, work);
  tail = next.catch(() => undefined);
  return next;
}
