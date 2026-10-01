import { matches, specificity } from "./match";
import type { Exclusion, Item, MerchantRules, RateRow } from "./schema";
import { isWeakSignal, overlapScore } from "./text";
import { DEFAULT_ID, EXCLUDED_ID, type Candidate, type ItemResult, type RuleOutcome } from "./types";

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const amountFor = (price: number, qty: number, rate: number) => round2((price * qty * rate) / 100);

const CONFLICT_CAP = 0.6;
const TIE_CAP = 0.6;

export function defaultCandidate(rules: MerchantRules): RateRow | null {
  const d = rules.defaultRate;
  if (!d) return null;
  return { id: DEFAULT_ID, label: d.label, rate: d.rate, match: {}, source: `Default: ${d.label}` };
}

export function excludedCandidate(): Exclusion {
  return {
    id: EXCLUDED_ID,
    label: "None of the listed categories; not eligible",
    match: {},
    scope: "item",
    reason: "No listed category fits this item well enough, so it is treated as not eligible.",
    source: "Classifier fallback",
  };
}

const eligible = (rules: MerchantRules, price: number, qty: number, row: RateRow, confidence: number, reason?: string): ItemResult => ({
  status: "eligible",
  rate: row.rate,
  amount: amountFor(price, qty, row.rate),
  confidence,
  tier: "rule",
  matchedRowId: row.id,
  reason: reason ?? `${row.label}: ${row.rate}% (${row.source})`,
});

const excludedResult = (ex: Exclusion): ItemResult => ({
  status: "excluded",
  rate: 0,
  amount: 0,
  confidence: 0.95,
  tier: "rule",
  matchedExclusionId: ex.id,
  reason: ex.reason,
});

function defaultResult(rules: MerchantRules, price: number, qty: number): ItemResult {
  const d = rules.defaultRate;
  if (!d) return { status: "unknown", rate: 0, amount: 0, confidence: 0, tier: "default", reason: "No listed category matches this item." };
  return {
    status: "eligible",
    rate: d.rate,
    amount: amountFor(price, qty, d.rate),
    confidence: d.assumed ? 0.5 : 0.9,
    tier: "default",
    matchedRowId: DEFAULT_ID,
    assumed: d.assumed,
    reason: d.assumed ? `Rate not in supplied terms; placeholder value (${d.rate}%).` : `${d.label}: ${d.rate}% (default rate)`,
  };
}

/** Deterministic pass. Says whether the item still needs the classifier tier. */
export function evaluateRules(item: Item, rules: MerchantRules, quantity = 1): RuleOutcome {
  const rows = rules.rateRows
    .filter((r) => matches(item, r.match))
    .map((r) => ({ r, s: specificity(r.match) }))
    .sort((a, b) => b.s - a.s);
  const exs = rules.exclusions
    .filter((e) => e.scope === "item" && matches(item, e.match))
    .map((e) => ({ e, s: specificity(e.match) }))
    .sort((a, b) => b.s - a.s);

  const topRows = rows.length ? rows.filter((x) => x.s === rows[0].s) : [];
  const tied = topRows.length > 1 && new Set(topRows.map((x) => x.r.rate)).size > 1;
  const row = rows.length ? (tied ? [...topRows].sort((a, b) => a.r.rate - b.r.rate)[0] : rows[0]) : null;
  const ex = exs[0] ?? null;

  let result: ItemResult;
  if (ex && !row) {
    result = excludedResult(ex.e);
  } else if (ex && row) {
    // The general exclusion loses only to a strictly more specific listed rate, and only for merchants that opt in.
    if (rules.specificityOverridesExclusions && row.s > ex.s) {
      result = eligible(
        rules,
        item.price,
        quantity,
        row.r,
        CONFLICT_CAP,
        `Listed rate conflicts with a general exclusion (${ex.e.label}); the more specific listed rate was applied.`,
      );
    } else {
      result = excludedResult(ex.e);
    }
  } else if (row) {
    result = eligible(rules, item.price, quantity, row.r, tied ? TIE_CAP : 0.95);
    if (tied) result.reason = `Several listed rows fit equally well (${topRows.map((x) => x.r.label).join(" / ")}); the lowest rate was used.`;
  } else {
    result = defaultResult(rules, item.price, quantity);
  }

  // Classifier tier, only for leftovers: weak category signal, or a real tie at the top.
  // A weak-signal item is never skipped: if no rule label shares words with it, the classifier gets every option.
  if (isWeakSignal(item.breadcrumb)) {
    const pool: Candidate[] = [...rules.rateRows, ...rules.exclusions.filter((e) => e.scope === "item")];
    const ranked = pool
      .map((c) => ({ c, s: overlapScore(item, c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.c);
    const candidates = ranked.length > 0 ? ranked : pool;
    const d = defaultCandidate(rules);
    return { result, needsClassifier: { reason: "weak_signal", candidates: [...candidates, ...(d ? [d] : []), excludedCandidate()] } };
  }
  if (tied && !ex) {
    return { result, needsClassifier: { reason: "tie", candidates: [...topRows.map((x) => x.r), excludedCandidate()] } };
  }
  return { result, needsClassifier: null };
}

/** Turn a classifier choice into an item result. */
export function applyChoice(item: Item, rules: MerchantRules, choiceId: string, p: number, quantity = 1): ItemResult {
  const base = { tier: "classifier" as const, confidence: p };
  if (choiceId === EXCLUDED_ID) {
    const ex = excludedCandidate();
    return { ...base, status: "excluded", rate: 0, amount: 0, matchedExclusionId: ex.id, reason: ex.reason };
  }
  if (choiceId === DEFAULT_ID) {
    const d = defaultResult(rules, item.price, quantity);
    return { ...d, tier: "classifier", confidence: d.assumed ? Math.min(p, 0.5) : p };
  }
  const row = rules.rateRows.find((r) => r.id === choiceId);
  if (row) {
    return {
      ...base,
      status: "eligible",
      rate: row.rate,
      amount: amountFor(item.price, quantity, row.rate),
      matchedRowId: row.id,
      reason: `Classifier placed this in "${row.label}" (${row.source}).`,
    };
  }
  const ex = rules.exclusions.find((e) => e.id === choiceId);
  if (ex) return { ...base, status: "excluded", rate: 0, amount: 0, matchedExclusionId: ex.id, reason: ex.reason };
  return defaultResult(rules, item.price, quantity);
}
