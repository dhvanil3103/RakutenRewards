// Authoritative per-product breadcrumb: the PDP embeds a BreadcrumbList JSON-LD block in its raw HTML.
// Fetched lazily (only for products on screen), streamed and aborted as soon as the block is found,
// cached by SKU, with low concurrency and a backoff after any non-200.
import { crumbsFromJsonLd } from "./bestbuy";

const TTL_MS = 30 * 24 * 3600 * 1000;
const CONCURRENCY = 2;
const mem = new Map<string, Promise<string[] | null>>();
let active = 0;
let blockedUntil = 0;
const waiting: (() => void)[] = [];

async function slot() {
  while (active >= CONCURRENCY || Date.now() < blockedUntil) {
    await new Promise<void>((r) => {
      waiting.push(r);
      setTimeout(r, Date.now() < blockedUntil ? 1000 : 5000);
    });
  }
  active++;
}
const release = () => {
  active--;
  waiting.shift()?.();
};

async function fetchCrumbs(url: string): Promise<string[] | null> {
  await slot();
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok || !res.body) {
      blockedUntil = Date.now() + 60_000;
      return null;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      for (const m of buf.matchAll(re)) {
        try {
          const j = JSON.parse(m[1]);
          const list = (Array.isArray(j) ? j : [j]).filter((b) => b?.["@type"] === "BreadcrumbList");
          const found = crumbsFromJsonLd(list);
          if (found) {
            await reader.cancel();
            return found;
          }
        } catch {
          /* partial or malformed block, keep reading */
        }
      }
      if (done) return null;
    }
  } catch {
    return null;
  } finally {
    release();
  }
}

export function breadcrumbFor(sku: string, url: string): Promise<string[] | null> {
  const hit = mem.get(sku);
  if (hit) return hit;
  const p = (async () => {
    const key = `bc:${sku}`;
    const stored = (await chrome.storage.local.get(key))[key] as { crumbs: string[]; at: number } | undefined;
    if (stored && Date.now() - stored.at < TTL_MS) return stored.crumbs;
    const crumbs = await fetchCrumbs(url);
    if (crumbs) await chrome.storage.local.set({ [key]: { crumbs, at: Date.now() } });
    else mem.delete(sku); // failures are retried later, not cached
    return crumbs;
  })();
  mem.set(sku, p);
  return p;
}
