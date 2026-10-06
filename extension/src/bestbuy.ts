// Best Buy page adapter. Listing selectors come from a live-DOM check by the project owner
// (li.product-list-item, h3.product-title > span.first-title, price-block testids); the PDP
// path reads schema.org JSON-LD. Seller (Marketplace) is NOT visible on cards, so cards default
// to "merchant" and that limit is surfaced in the tooltip.
import type { Item } from "../../src/engine";

export interface Card {
  el: HTMLElement;
  item: Item;
  url: string;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const GENERIC_CRUMBS = new Set(["best buy", "home", "bestbuy"]);

/** Brands the rules mention, longest first so "beats by dr. dre" wins over "beats". */
let known: string[] = [];
export const setKnownBrands = (brands: string[]) => {
  known = [...new Set(brands.map((b) => b.toLowerCase()))].sort((a, b) => b.length - a.length);
};

/**
 * Brand from evidence in the title: the earliest known brand (longest first on ties) as a whole word.
 * Falls back to the page's brand field, then the first word. No assumptions about prefixes like "New!".
 */
export function brandOf(title: string, fieldBrand: string): string {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9&+. ]+/g, " ")} `;
  let best: { b: string; at: number } | null = null;
  for (const b of known) {
    const at = t.indexOf(` ${b} `);
    if (at >= 0 && (!best || at < best.at)) best = { b, at };
  }
  return best?.b ?? (fieldBrand.trim() || title.split(" ")[0]);
}

export function parsePrice(s: string): number | null {
  const m = s.replace(/,/g, "").match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

function jsonLdBlocks(root: ParentNode): unknown[] {
  const out: unknown[] = [];
  root.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const j = JSON.parse(s.textContent ?? "");
      out.push(...(Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j]));
    } catch {
      /* ignore malformed block */
    }
  });
  return out;
}

export function crumbsFromJsonLd(blocks: unknown[]): string[] | null {
  const list = blocks.find((b) => (b as { "@type"?: string })?.["@type"] === "BreadcrumbList") as
    | { itemListElement?: { name?: string; item?: { name?: string } | string }[] }
    | undefined;
  if (!list?.itemListElement) return null;
  const names = list.itemListElement
    .map((e) => (typeof e.item === "object" ? e.item?.name : undefined) ?? e.name ?? "")
    .map((n) => n.trim())
    .filter((n) => n && !GENERIC_CRUMBS.has(n.toLowerCase()));
  return names.length ? names : null;
}

/** Page-level breadcrumb (category pages): JSON-LD first, then the visible nav. */
export function pageBreadcrumb(doc: Document = document): string[] {
  const fromLd = crumbsFromJsonLd(jsonLdBlocks(doc));
  if (fromLd) return fromLd;
  const nav = [...doc.querySelectorAll("nav.c-breadcrumbs a, nav[aria-label*='readcrumb' i] a")].map(text);
  return nav.filter((n) => n && !GENERIC_CRUMBS.has(n.toLowerCase()));
}

const PRODUCT_HREF = 'a[href*="/product/"], a[href*="skuId="]';

/** SKU from a Best Buy product URL: ?skuId=123 or /product/<slug>/<code>. */
function skuFromUrl(href: string): string {
  try {
    const u = new URL(href, location.href);
    return u.searchParams.get("skuId") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return "";
  }
}

function priceIn(el: Element): number {
  const sr = text(el.querySelector('[data-testid="price-block-customer-price"] .sr-only')) || text(el.querySelector('[data-testid="price-block-customer-price"]'));
  return parsePrice(sr || text(el)) ?? 0; // the rate does not depend on price, so a missing price must not hide the badge
}

/**
 * Product cards anywhere on the site. Search results use a known card element; everything else (home page
 * carousels, deal rows, recommendations) is found generically: the largest ancestor of a product link that
 * still contains only that one product.
 */
export function cardsIn(root: ParentNode, crumbs: string[]): Card[] {
  const cards: Card[] = [];
  const claimed = new Set<HTMLElement>();
  const add = (el: HTMLElement, link: HTMLAnchorElement, title: string, brandField: string) => {
    const sku = el.dataset.productId ?? skuFromUrl(link.href);
    if (!sku || !title) return;
    claimed.add(el);
    cards.push({
      el,
      url: link.href,
      item: { id: sku, merchant: "bestbuy", title, brand: brandOf(title, brandField), breadcrumb: crumbs, price: priceIn(el), seller: "merchant", flags: [] },
    });
  };

  root.querySelectorAll<HTMLElement>("li.product-list-item").forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>("a.product-list-item-link[href]") ?? el.querySelector<HTMLAnchorElement>(PRODUCT_HREF);
    const title = text(el.querySelector("h3.product-title")) || text(link);
    if (link) add(el, link, title, text(el.querySelector("h3.product-title span.first-title")));
  });

  root.querySelectorAll<HTMLAnchorElement>(PRODUCT_HREF).forEach((link) => {
    if (link.closest("[data-cashback-badge]") || [...claimed].some((c) => c.contains(link))) return;
    const href = link.href.split("#")[0];
    let card: HTMLElement | null = null;
    for (let el = link.parentElement; el && el !== document.body; el = el.parentElement) {
      const others = new Set([...el.querySelectorAll<HTMLAnchorElement>(PRODUCT_HREF)].map((a) => a.href.split("#")[0]));
      if (others.size > 1) break; // reached a container holding several products
      if (/\$\s?\d/.test(el.textContent ?? "") || el.querySelector("img")) card = el;
    }
    if (!card || claimed.has(card)) return;
    const title = text(link) || link.getAttribute("aria-label") || card.querySelector("img")?.getAttribute("alt") || text(card.querySelector("h2, h3, h4"));
    if (title && title.length > 3) add(card, link, title, "");
    void href;
  });
  return cards;
}

/** Product detail page: schema.org Product + BreadcrumbList from the page itself. */
export function productFromPage(doc: Document = document): Item | null {
  const blocks = jsonLdBlocks(doc);
  const p = blocks.find((b) => (b as { "@type"?: string })?.["@type"] === "Product") as
    | { name?: string; sku?: string; brand?: { name?: string } | string; offers?: unknown }
    | undefined;
  if (!p?.name) return null;
  const offer = (Array.isArray(p.offers) ? p.offers[0] : p.offers) as { price?: number | string; lowPrice?: number | string } | undefined;
  const price = Number(offer?.price ?? offer?.lowPrice);
  if (!Number.isFinite(price)) return null;
  const brand = brandOf(p.name, typeof p.brand === "string" ? p.brand : p.brand?.name ?? "");
  return {
    id: String(p.sku ?? location.pathname),
    merchant: "bestbuy",
    title: p.name,
    brand,
    breadcrumb: crumbsFromJsonLd(blocks) ?? [],
    price,
    seller: "merchant",
    flags: [],
  };
}
