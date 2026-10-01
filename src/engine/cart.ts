import { amountFor, round2 } from "./evaluate";
import type { Item, MerchantRules } from "./schema";
import type { ItemResult } from "./types";

export const TAX_RATE = 0.08;
export const SHIPPING_FLAT = 7.99;
export const FREE_SHIPPING_OVER = 100;

export interface CartLineInput {
  item: Item;
  quantity: number;
  result: ItemResult;
}
export interface CartOptions {
  starDollars?: number;
  nonUS?: boolean;
  returnSimulated?: boolean;
}
export interface CartLineOut {
  item: Item;
  quantity: number;
  lineTotal: number;
  result: ItemResult; // adjusted by order-level rules
  cashBack: number;
}
export interface CartSummary {
  lines: CartLineOut[];
  subtotal: number;
  tax: number;
  shipping: number;
  orderTotal: number;
  cashBack: number;
  pctOfSubtotal: number;
  storeCreditFactor: number;
  notEarning: { itemId: string; title: string; reason: string }[];
  warnings: string[];
  infos: string[];
  voided: boolean;
}

const asExcluded = (r: ItemResult, reason: string): ItemResult => ({
  ...r,
  status: "excluded",
  rate: 0,
  amount: 0,
  confidence: 0.95,
  reason,
});

export function evaluateCart(lines: CartLineInput[], rules: MerchantRules, opts: CartOptions = {}): CartSummary {
  const orderRules = rules.orderRules;
  const rule = (t: string) => orderRules.find((o) => o.type === t);
  const subtotal = round2(lines.reduce((s, l) => s + l.item.price * l.quantity, 0));
  const tax = round2(subtotal * TAX_RATE);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  const orderTotal = round2(subtotal + tax + shipping);

  const maxQty = rule("max_same_sku_qty");
  const nonUs = rule("non_us_excluded");
  const voidRule = rule("void_all_on_returns");
  const credit = rule("reduce_base_by_store_credit");
  const review = rule("review_over_amount");
  const voided = !!(voidRule && opts.returnSimulated);

  let out: CartLineOut[] = lines.map((l) => {
    let result = { ...l.result };
    if (result.status === "eligible") result.amount = amountFor(l.item.price, l.quantity, result.rate);
    if (maxQty && l.quantity >= Number(maxQty.params.threshold)) result = asExcluded(result, maxQty.message);
    if (nonUs && opts.nonUS) result = asExcluded(result, nonUs.message);
    if (voided) result = asExcluded(result, voidRule!.message);
    return { item: l.item, quantity: l.quantity, lineTotal: round2(l.item.price * l.quantity), result, cashBack: result.status === "eligible" ? result.amount : 0 };
  });

  let factor = 1;
  const infos: string[] = [];
  if (credit && (opts.starDollars ?? 0) > 0 && subtotal > 0) {
    const used = Math.min(opts.starDollars!, subtotal);
    factor = (subtotal - used) / subtotal;
    infos.push(`${credit.message} $${used.toFixed(2)} paid with Star Dollars, so the eligible base is reduced by ${((1 - factor) * 100).toFixed(1)}%.`);
  }
  out = out.map((l) => ({ ...l, cashBack: round2(l.cashBack * factor) }));
  const cashBack = round2(out.reduce((s, l) => s + l.cashBack, 0));

  const warnings: string[] = [];
  if (review && orderTotal > Number(review.params.amount)) warnings.push(review.message);
  if (voided) warnings.push(voidRule!.message);
  for (const o of orderRules) if (o.type === "info") infos.push(o.message);

  const notEarning = out
    .filter((l) => l.result.status !== "eligible")
    .map((l) => ({ itemId: l.item.id, title: l.item.title, reason: l.result.status === "unknown" ? "Category not recognised from the terms." : l.result.reason }));

  return {
    lines: out,
    subtotal,
    tax,
    shipping,
    orderTotal,
    cashBack,
    pctOfSubtotal: subtotal === 0 ? 0 : (cashBack / subtotal) * 100,
    storeCreditFactor: factor,
    notEarning,
    warnings,
    infos,
    voided,
  };
}
