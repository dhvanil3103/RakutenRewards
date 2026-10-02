import type { CartOptions } from "../engine/cart";
import type { MerchantId } from "../engine/schema";
import type { Status } from "../engine/types";

export interface Fixture {
  merchant: MerchantId;
  productId: string;
  note?: string;
  quantity?: number;
  cart?: CartOptions;
  expected: {
    status: Status;
    rate?: number;
    maxConfidence?: number; // conflict cases must not be confident
    cashBack?: number; // line cash back after cart rules
  };
}

const bb = (id: string, expected: Fixture["expected"], extra: Partial<Fixture> = {}): Fixture => ({ merchant: "bestbuy", productId: `bb-${id}`, expected, ...extra });
const mc = (id: string, expected: Fixture["expected"], extra: Partial<Fixture> = {}): Fixture => ({ merchant: "macys", productId: `mc-${id}`, expected, ...extra });
const nk = (id: string, expected: Fixture["expected"], extra: Partial<Fixture> = {}): Fixture => ({ merchant: "nike", productId: `nk-${id}`, expected, ...extra });
const ok = (rate: number, more: Partial<Fixture["expected"]> = {}): Fixture["expected"] => ({ status: "eligible", rate, ...more });
const no: Fixture["expected"] = { status: "excluded" };

export const GOLDEN: Fixture[] = [
  // Best Buy
  bb("ninja-airfryer", ok(8), { note: "Ninja appliances" }),
  bb("sony-headphones", ok(7.5), { note: "Sony beats the general headphone row" }),
  bb("bose-headphones", ok(7)),
  bb("jlab-earbuds", ok(2), { note: "specific 2 beats the general 6" }),
  bb("airpods", no),
  bb("beats-studio", no),
  bb("macbook", no),
  bb("dell-laptop", ok(2.5), { note: "listed laptop vs Laptops exclusion" }),
  bb("hp-laptop", no, { note: "generic unlisted laptop" }),
  bb("lenovo-chromebook", ok(2)),
  bb("sony-tv", ok(5)),
  bb("samsung-tv", ok(2)),
  bb("lg-tv", ok(1.5)),
  bb("hisense-tv", ok(5)),
  bb("insignia-tv", ok(3)),
  bb("mariokart", ok(4)),
  bb("zelda-digital", no, { note: "digital download" }),
  bb("switch-console", ok(2), { note: "conflict with Video Game Consoles" }),
  bb("ps5pro", no),
  bb("ring-doorbell", ok(5), { note: "overrides Security exclusion" }),
  bb("tplink-router", no),
  bb("giftcard", no),
  bb("motorola-phone", ok(1)),
  bb("samsung-phone", ok(3)),
  bb("iphone", no),
  bb("tp-apple-keyboard", no, { note: "third-party Apple" }),
  bb("tp-select-lamp", ok(3)),
  bb("lenovo-thinkpad", ok(4), { note: "select Lenovo laptop vs Laptops exclusion" }),
  bb("hp-printer", ok(6)),
  bb("ge-oven", ok(5)),
  bb("geeksquad", no),
  bb("ninja-airfryer", no, { quantity: 6, note: "6 of the same SKU" }),
  bb("sonos-era", ok(2), { note: "messy breadcrumb, classifier" }),
  bb("jbl-flip", ok(2), { note: "missing breadcrumb, classifier" }),
  // Macy's
  mc("rl-shirt", ok(4)),
  mc("hugo-suit", no),
  mc("sofa", ok(1.5)),
  mc("market-board", ok(1.5), { note: "marketplace seller" }),
  mc("tv", ok(1.5), { note: "electronics" }),
  mc("rug", no),
  mc("book", no),
  mc("pandora", no),
  mc("sunglasses", no),
  mc("birkenstock", no),
  mc("mk-watch", ok(4)),
  mc("fitbit", no, { note: "fitness tracker is Health/Fitness" }),
  mc("giftcard", no),
  mc("tumi", no, { note: "leased brand" }),
  mc("rl-shirt", ok(4, { cashBack: 1.97 }), { cart: { starDollars: 49.25 }, note: "half paid with Star Dollars" }),
  mc("messy-shades", no, { note: "messy breadcrumb, classifier" }),
  mc("messy-boss-polo", no, { note: "messy breadcrumb, classifier" }),
  // Nike
  nk("airmax90", ok(2), { note: "placeholder default rate" }),
  nk("airmax-dn8", no, { note: "new release" }),
  nk("hyperice-legs", no),
  nk("jordan-select", no),
  nk("af1-refurb", no),
  nk("dunk-snkrs", no),
  nk("giftcard", no),
  nk("marathon-ticket", no),
  nk("airmax90", no, { cart: { nonUS: true }, note: "non-US shipping" }),
  nk("airmax90", { status: "excluded", cashBack: 0 }, { cart: { returnSimulated: true }, note: "return voids the whole order" }),
  nk("messy-hypervolt", no, { note: "missing flag, classifier" }),
  nk("messy-pegasus", ok(2), { note: "weak signal, nothing to ask the classifier" }),
];
