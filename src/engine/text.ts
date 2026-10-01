import type { Item } from "./schema";
import type { Candidate } from "./types";

const STOP = new Set([
  "all", "other", "and", "the", "for", "of", "with", "select", "product", "item", "order",
  "purchase", "shoe", "categories", "category", "only", "by", "on", "in", "or", "to", "from",
]);

const GENERIC_PATH = new Set(["deals", "sale", "featured", "clearance", "shop", "all", "trending", "popular", "new", "top deals", "other"]);

function stem(w: string): string {
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ss")) return w;
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map(stem)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** A breadcrumb is a weak signal when it is short or made only of generic words. */
export function isWeakSignal(breadcrumb: string[]): boolean {
  if (breadcrumb.length < 2) return true;
  return breadcrumb.every((seg) => GENERIC_PATH.has(seg.toLowerCase().trim()));
}

export function keywordsOf(c: Candidate): Set<string> {
  const parts = [c.label];
  const m = c.match;
  for (const list of [m.brandAny, m.pathAny, m.titleAny, m.flagsAll]) if (list) parts.push(...list);
  return new Set(parts.flatMap(tokenize));
}

/** Token overlap between item text and a candidate. Brand hits count most, then title, then path. */
export function overlapScore(item: Item, c: Candidate): number {
  const kw = keywordsOf(c);
  const hit = (tokens: string[]) => new Set(tokens.filter((t) => kw.has(t))).size;
  return 3 * hit(tokenize(item.brand)) + 1.5 * hit(tokenize(item.title)) + 1 * hit(item.breadcrumb.flatMap(tokenize));
}
