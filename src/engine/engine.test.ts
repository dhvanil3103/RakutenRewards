import { describe, expect, it } from "vitest";
import { CATALOG, RULES, findItem } from "../data";
import { MockClassifier } from "./classifier";
import { amountFor, evaluateRules } from "./evaluate";
import { evaluateCart } from "./cart";
import { Resolver } from "./resolver";
import { MerchantRulesSchema, type Item, type MerchantRules } from "./schema";

const item = (over: Partial<Item>): Item => ({
  id: "t1", merchant: "bestbuy", title: "Test", brand: "Acme", breadcrumb: ["A", "B"], price: 100, seller: "merchant", flags: [], ...over,
});
const row = (id: string, rate: number, match: MerchantRules["rateRows"][number]["match"]) => ({ id, label: id, rate, match, source: id });
const ex = (id: string, match: MerchantRules["exclusions"][number]["match"]) => ({ id, label: id, match, scope: "item" as const, reason: `no ${id}`, source: id });
const rules = (over: Partial<MerchantRules>): MerchantRules => ({
  merchantId: "bestbuy", name: "T", calcBasis: "", defaultRate: null, rateRows: [], exclusions: [], orderRules: [], specificityOverridesExclusions: false, specialTerms: [], ...over,
});
const bb = (id: string) => evaluateRules(findItem("bestbuy", `bb-${id}`)!, RULES.bestbuy).result;

describe("rules files", () => {
  it("validate against the zod schema", () => {
    for (const r of Object.values(RULES)) expect(() => MerchantRulesSchema.parse(r)).not.toThrow();
  });
  it("every rate row and exclusion carries a source label", () => {
    for (const r of Object.values(RULES)) {
      for (const x of [...r.rateRows, ...r.exclusions]) expect(x.source.length).toBeGreaterThan(3);
    }
  });
});

describe("specificity and precedence", () => {
  it("brand + path beats brand only beats path only", () => {
    const r = rules({ rateRows: [row("path", 1, { pathAny: ["headphones"] }), row("brand", 2, { brandAny: ["acme"] }), row("both", 3, { brandAny: ["acme"], pathAny: ["headphones"] })] });
    expect(evaluateRules(item({ breadcrumb: ["Audio", "Headphones"] }), r).result.rate).toBe(3);
    expect(evaluateRules(item({ breadcrumb: ["Audio", "Speakers"] }), r).result.rate).toBe(2);
    expect(evaluateRules(item({ brand: "Other", breadcrumb: ["Audio", "Headphones"] }), r).result.rate).toBe(1);
  });
  it("Sony headphones (7.5) beat the general 6%; JLab gets its listed 2", () => {
    expect(bb("sony-headphones").rate).toBe(7.5);
    expect(bb("jlab-earbuds").rate).toBe(2);
  });
  it("an exclusion alone excludes; no match falls back to the default rate", () => {
    const r = rules({ exclusions: [ex("gift", { flagsAll: ["giftCard"] })], defaultRate: { rate: 1, label: "Other" } });
    expect(evaluateRules(item({ flags: ["giftCard"] }), r).result.status).toBe("excluded");
    const d = evaluateRules(item({}), r).result;
    expect([d.status, d.rate, d.tier, d.confidence]).toEqual(["eligible", 1, "default", 0.9]);
  });
  it("assumed default drops confidence to 0.5; no default means unknown", () => {
    expect(evaluateRules(item({}), rules({ defaultRate: { rate: 2, label: "x", assumed: true } })).result.confidence).toBe(0.5);
    expect(evaluateRules(item({}), rules({})).result.status).toBe("unknown");
  });
  it("ties with different rates take the lower rate, cap confidence at 0.6 and ask the classifier", () => {
    const r = rules({ rateRows: [row("a", 6, { pathAny: ["headphones"] }), row("b", 3, { pathAny: ["headphones"] })] });
    const out = evaluateRules(item({ breadcrumb: ["Audio", "Headphones"] }), r);
    expect(out.result.rate).toBe(3);
    expect(out.result.confidence).toBeLessThanOrEqual(0.6);
    expect(out.needsClassifier?.reason).toBe("tie");
  });
});

describe("exclusion conflicts", () => {
  it("Best Buy: a more specific listed rate overrides a general exclusion with capped confidence", () => {
    const ring = bb("ring-doorbell");
    expect([ring.status, ring.rate]).toEqual(["eligible", 5]);
    expect(ring.confidence).toBeLessThanOrEqual(0.6);
    expect(ring.reason).toContain("Listed rate conflicts with a general exclusion (Security)");
    expect(evaluateRules(findItem("bestbuy", "bb-ring-doorbell")!, RULES.bestbuy).needsClassifier?.reason).toBe("conflict");
    const sw = bb("switch-console");
    expect(sw.rate).toBe(2);
    expect(sw.confidence).toBeLessThanOrEqual(0.6);
  });
  it("Best Buy: a general exclusion still wins when no more specific rate exists", () => {
    expect(bb("hp-laptop").status).toBe("excluded");
    expect(bb("tp-apple-keyboard").status).toBe("excluded");
    expect(bb("beats-studio").status).toBe("excluded");
  });
  it("without the override flag the exclusion always wins (Macy's fitness tracker is electronics)", () => {
    const fit = evaluateRules(findItem("macys", "mc-fitbit")!, RULES.macys).result;
    expect(fit.status).toBe("excluded");
  });
});

describe("amounts", () => {
  it("rounds to cents on price x quantity x rate", () => {
    expect(amountFor(12.99, 1, 4)).toBe(0.52);
    expect(amountFor(33.33, 3, 7.5)).toBe(7.5);
    expect(amountFor(10.05, 1, 1.5)).toBe(0.15);
  });
});

describe("cart order rules", () => {
  const line = (merchant: "bestbuy" | "macys" | "nike", id: string, quantity = 1) => {
    const it = findItem(merchant, id)!;
    return { item: it, quantity, result: evaluateRules(it, RULES[merchant]).result };
  };
  it("Best Buy: 6 of the same SKU is excluded, 5 is not", () => {
    expect(evaluateCart([line("bestbuy", "bb-ninja-airfryer", 6)], RULES.bestbuy).lines[0].result.status).toBe("excluded");
    const five = evaluateCart([line("bestbuy", "bb-ninja-airfryer", 5)], RULES.bestbuy);
    expect(five.lines[0].result.status).toBe("eligible");
    expect(five.cashBack).toBe(amountFor(129.99, 5, 8));
  });
  it("Macy's: Star Dollars reduce the eligible base proportionally", () => {
    const l = line("macys", "mc-rl-shirt"); // $98.50 at 4%
    const full = evaluateCart([l], RULES.macys);
    const half = evaluateCart([l], RULES.macys, { starDollars: 49.25 });
    expect(full.cashBack).toBe(3.94);
    expect(half.cashBack).toBe(1.97);
    expect(evaluateCart([l], RULES.macys, { starDollars: 9999 }).cashBack).toBe(0);
  });
  it("Nike: non-US excludes all lines; a return voids the whole order; over $500 warns", () => {
    const l = line("nike", "nk-airmax90");
    expect(evaluateCart([l], RULES.nike, { nonUS: true }).cashBack).toBe(0);
    const v = evaluateCart([l, line("nike", "nk-tech-hoodie")], RULES.nike, { returnSimulated: true });
    expect(v.cashBack).toBe(0);
    expect(v.voided).toBe(true);
    expect(evaluateCart([line("nike", "nk-airmax90", 5)], RULES.nike).warnings.join(" ")).toContain("$500");
    expect(evaluateCart([l], RULES.nike).warnings).toHaveLength(0);
  });
  it("tax is never part of the base", () => {
    const s = evaluateCart([line("bestbuy", "bb-ninja-airfryer")], RULES.bestbuy);
    expect(s.cashBack).toBe(amountFor(129.99, 1, 8));
    expect(s.tax).toBeGreaterThan(0);
  });
});

describe("weak signal is never skipped", () => {
  it("sends the full option list when no rule label overlaps the item", () => {
    const it = item({ merchant: "bestbuy", title: "Zorblax Quantum Widget", brand: "Zorblax", breadcrumb: ["Deals"] });
    const out = evaluateRules(it, RULES.bestbuy);
    expect(out.needsClassifier?.reason).toBe("weak_signal");
    expect(out.needsClassifier!.candidates.length).toBeGreaterThan(RULES.bestbuy.rateRows.length);
  });
  it("a generic breadcrumb word is not evidence (Deals does not match Top Deals)", () => {
    const it = item({ merchant: "bestbuy", title: "Zorblax Quantum Widget", brand: "Zorblax", breadcrumb: ["Deals"] });
    const ids = evaluateRules(it, RULES.bestbuy).needsClassifier!.candidates.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(50);
  });
});

describe("resolver cost control", () => {
  it("memoizes: an item is evaluated once", async () => {
    const r = new Resolver(RULES, new MockClassifier());
    const it = CATALOG.bestbuy[0];
    await r.resolve(it);
    await r.resolve(it);
    r.request(it);
    expect(r.getStats().totalVisible).toBe(1);
  });
  it("shares classifier results by category signature", async () => {
    const r = new Resolver(RULES, new MockClassifier());
    const a = findItem("bestbuy", "bb-sonos-era")!;
    const b = { ...a, id: "bb-sonos-two", title: "Sonos Beam Soundbar" };
    await r.resolve(a);
    await r.resolve(b);
    const s = r.getStats();
    expect([s.classifierCalls, s.cacheHits, s.totalVisible]).toEqual([1, 1, 2]);
    expect(s.avoidedPct).toBe(50);
  });
  it("sends weak-signal items to the classifier and strong ones to rules", async () => {
    const r = new Resolver(RULES, new MockClassifier());
    const sonos = await r.resolve(findItem("bestbuy", "bb-sonos-era")!);
    expect(sonos.tier).toBe("classifier");
    expect(sonos.rate).toBe(2);
    expect((await r.resolve(findItem("bestbuy", "bb-ninja-airfryer")!)).tier).toBe("rule");
  });
});

describe("title cross-check", () => {
  const sony = (over: Partial<Item>): Item => ({
    id: "x", merchant: "bestbuy", title: "New! - Sony - WH-CH530 Wireless Headphone with Microphone - Black", brand: "Sony",
    breadcrumb: ["Audio", "Headphones", "On-Ear Headphones"], price: 59.99, seller: "merchant", flags: [], ...over,
  });
  it("trusts the rules when brand and title agree", () => {
    expect(evaluateRules(sony({}), RULES.bestbuy).needsClassifier).toBeNull();
  });
  it("asks the classifier when the merchant brand field is wrong but the title says Sony headphones", () => {
    const out = evaluateRules(sony({ brand: "New!" }), RULES.bestbuy);
    expect(["tie", "disagreement"]).toContain(out.needsClassifier?.reason);
    expect(out.needsClassifier?.candidates.map((c) => c.id)).toContain("7-5-sony-headphones");
  });
});
