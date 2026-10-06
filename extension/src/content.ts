import { Resolver, type Classifier, type Distribution, type Item } from "../../src/engine";
import { MerchantRulesSchema } from "../../src/engine";
import bestbuyRules from "../../src/data/rules/bestbuy.json";
import { isWeakSignal } from "../../src/engine";
import { cardsIn, pageBreadcrumb, productFromPage, setKnownBrands, type Card } from "./bestbuy";
import { breadcrumbFor } from "./breadcrumbs";
import { mountBadge } from "./badge";
import { loadSettings, type ClassifyResponse } from "./shared";

const NOTE = "Marketplace (third-party) items can't be told apart on this page.";

/** Sends classifier calls to the service worker, which owns the backend URL and CORS access. */
class BridgeClassifier implements Classifier {
  name = "Jev via extension background";
  lastFellBack = false;
  async classify(item: Item, candidates: Parameters<Classifier["classify"]>[1]) {
    const res = (await chrome.runtime.sendMessage({ type: "classify", item, candidates })) as ClassifyResponse | undefined;
    if (!res?.ok) throw new Error("classifier unavailable");
    this.lastFellBack = res.fellBack;
    return Object.assign(res.dist, { via: res.via }) as Distribution;
  }
}

// A weak breadcrumb must never share a cached answer with a different product of the same brand.
const signatureOf = (i: Item) => (isWeakSignal(i.breadcrumb) ? `${i.merchant}:id:${i.id}` : `${i.merchant}:${i.brand}:${i.breadcrumb.join(">")}`);
// Only Best Buy is active in this build; the other merchants are required by the type but never queried.
const bestbuy = MerchantRulesSchema.parse(bestbuyRules);
setKnownBrands([...bestbuy.rateRows, ...bestbuy.exclusions].flatMap((r) => r.match.brandAny ?? []));
const RULES = { bestbuy, nike: bestbuy, macys: bestbuy };
const resolver = new Resolver(RULES, new BridgeClassifier(), signatureOf);

const seen = new WeakSet<HTMLElement>();
let io: IntersectionObserver;

async function evaluate(card: Card, settings: Awaited<ReturnType<typeof loadSettings>>) {
  const set = mountBadge(card.el, "absolute");
  set({ kind: "loading" });
  const crumbs = await breadcrumbFor(card.item.id, card.url);
  const item: Item = { ...card.item, breadcrumb: crumbs ?? card.item.breadcrumb };
  const result = await resolver.resolve(item);
  set({ kind: "result", result, price: item.price, threshold: settings.threshold, note: `${NOTE} Read as: brand "${item.brand}", path "${item.breadcrumb.join(" > ") || "none"}".` });
}

async function scan() {
  const settings = await loadSettings();
  if (!settings.enabled) return;
  const page = pageBreadcrumb();
  for (const card of cardsIn(document, page)) {
    if (seen.has(card.el)) continue;
    seen.add(card.el);
    io.observe(card.el);
    (card.el as HTMLElement & { _cb?: Card })._cb = card;
  }
}

let mountedFor = "";

async function product() {
  const settings = await loadSettings();
  if (!settings.enabled || !/\/product\//.test(location.pathname)) return;
  const key = location.pathname;
  const existing = document.querySelector("[data-cashback-badge='pdp']");
  if (mountedFor === key && existing?.isConnected) return; // already showing for this product
  existing?.remove();
  const item = productFromPage();
  const anchor = document.querySelector("h1");
  if (!item || !anchor?.parentElement) return;
  mountedFor = key; // set before awaiting so repeated page mutations cannot mount a second badge
  const set = mountBadge(anchor.parentElement, "inline", "pdp");
  set({ kind: "loading" });
  const result = await resolver.resolve(item);
  set({ kind: "result", result, price: item.price, threshold: settings.threshold, note: `${NOTE} Read as: brand "${item.brand}", path "${item.breadcrumb.join(" > ") || "none"}".` });
}

function start() {
  io = new IntersectionObserver(
    async (entries) => {
      const settings = await loadSettings();
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement & { _cb?: Card };
        io.unobserve(el);
        if (el._cb) void evaluate(el._cb, settings);
      }
    },
    { threshold: 0.5, rootMargin: "100px" },
  );
  let timer: number | undefined;
  const rescan = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      void scan();
      void product();
    }, 400);
  };
  new MutationObserver(rescan).observe(document.body, { childList: true, subtree: true }); // infinite scroll, SPA navigation
  rescan();
}

start();
