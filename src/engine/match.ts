import type { Item, Match } from "./schema";

const low = (s: string) => s.toLowerCase().trim();

export function matches(item: Item, m: Match): boolean {
  const brand = low(item.brand);
  const path = item.breadcrumb.map(low);
  const title = low(item.title);
  if (m.brandAny && !m.brandAny.some((b) => low(b) === brand)) return false;
  if (m.pathAny && !m.pathAny.some((k) => path.some((seg) => seg.includes(low(k))))) return false;
  if (m.titleAny && !m.titleAny.some((k) => title.includes(low(k)))) return false;
  if (m.seller && m.seller !== item.seller) return false;
  if (m.flagsAll && !m.flagsAll.every((f) => item.flags.includes(f))) return false;
  if (m.notBrandAny && m.notBrandAny.some((b) => low(b) === brand)) return false;
  if (m.notPathAny && m.notPathAny.some((k) => path.some((seg) => seg.includes(low(k))))) return false;
  if (m.notFlagsAny && m.notFlagsAny.some((f) => item.flags.includes(f))) return false;
  return true;
}

/**
 * How narrow a match is. Positive constraints count: brand (3) beats path (2),
 * title and flags (2), seller (1); so brand + path beats brand only beats path only.
 * Negative constraints only break ties between otherwise equal rows (0.25 each).
 */
export function specificity(m: Match): number {
  let s = 0;
  if (m.brandAny) s += 3;
  if (m.pathAny) s += 2;
  if (m.titleAny) s += 2;
  if (m.flagsAll) s += 2;
  if (m.seller) s += 1;
  if (m.notBrandAny) s += 0.25;
  if (m.notPathAny) s += 0.25;
  if (m.notFlagsAny) s += 0.25;
  return s;
}
