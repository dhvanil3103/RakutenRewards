import { CATALOG, RULES } from "../data";
import { MockClassifier } from "../engine/classifier";
import { evaluateCart } from "../engine/cart";
import { Resolver } from "../engine/resolver";
import type { MerchantId } from "../engine/schema";
import { GOLDEN } from "./golden";

const resolver = new Resolver(RULES, new MockClassifier());
const merchants: MerchantId[] = ["bestbuy", "macys", "nike"];
type Row = { merchant: MerchantId; ok: boolean; tier: string; line: string; why: string };
const rows: Row[] = [];

for (const f of GOLDEN) {
  const item = CATALOG[f.merchant].find((i) => i.id === f.productId);
  if (!item) throw new Error(`Unknown product ${f.productId}`);
  const result = await resolver.resolve(item);
  const qty = f.quantity ?? 1;
  const useCart = f.quantity !== undefined || f.cart !== undefined;
  const cart = useCart ? evaluateCart([{ item, quantity: qty, result }], RULES[f.merchant], f.cart) : null;
  const final = cart ? cart.lines[0].result : result;
  const cashBack = cart ? cart.lines[0].cashBack : result.amount;

  const problems: string[] = [];
  if (final.status !== f.expected.status) problems.push(`status ${final.status}, expected ${f.expected.status}`);
  if (f.expected.rate !== undefined && final.rate !== f.expected.rate) problems.push(`rate ${final.rate}, expected ${f.expected.rate}`);
  if (f.expected.maxConfidence !== undefined && final.confidence > f.expected.maxConfidence) problems.push(`confidence ${final.confidence}, expected <= ${f.expected.maxConfidence}`);
  if (f.expected.cashBack !== undefined && cashBack !== f.expected.cashBack) problems.push(`cash back ${cashBack}, expected ${f.expected.cashBack}`);
  rows.push({ merchant: f.merchant, ok: problems.length === 0, tier: result.tier, line: `${f.productId}${f.note ? ` (${f.note})` : ""}`, why: problems.length ? `${problems.join("; ")} | ${final.reason}` : "" });
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);
console.log("\nmerchant   fixtures  accuracy   rule  classifier  default");
for (const m of merchants) {
  const r = rows.filter((x) => x.merchant === m);
  const n = (t: string) => r.filter((x) => x.tier === t).length;
  console.log(`${m.padEnd(10)} ${String(r.length).padStart(8)}  ${pct(r.filter((x) => x.ok).length, r.length).padStart(8)}  ${String(n("rule")).padStart(5)}  ${String(n("classifier")).padStart(10)}  ${String(n("default")).padStart(7)}`);
}
const ruleRows = rows.filter((x) => x.tier === "rule");
const ruleAcc = ruleRows.filter((x) => x.ok).length / (ruleRows.length || 1);
console.log(`\noverall ${pct(rows.filter((x) => x.ok).length, rows.length)} (${rows.length} fixtures), rule-tier ${pct(ruleRows.filter((x) => x.ok).length, ruleRows.length)}`);

const bad = rows.filter((x) => !x.ok);
if (bad.length) {
  console.log("\nMismatches:");
  for (const b of bad) console.log(`  [${b.merchant}] ${b.line}\n    ${b.why}`);
} else console.log("No mismatches.");

const s = resolver.getStats();
console.log(`\nclassifier calls ${s.classifierCalls} over ${s.totalVisible} evaluations (${s.avoidedPct.toFixed(1)}% avoided, ${s.cacheHits} cache hits)`);
if (ruleAcc < 0.95) {
  console.error("\nRule-tier accuracy below 95%.");
  process.exit(1);
}
