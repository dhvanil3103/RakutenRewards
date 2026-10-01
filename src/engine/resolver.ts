import type { Classifier } from "./classifier";
import { applyChoice, evaluateRules } from "./evaluate";
import type { Item, MerchantId, MerchantRules } from "./schema";
import type { ItemResult } from "./types";

export interface ResolverStats {
  totalVisible: number; // unique products evaluated (each only once)
  ruleResolved: number; // answered by rules or the default rate, no classifier involved
  classifierResolved: number; // fresh classifier calls that completed
  cacheHits: number; // needed the classifier but reused a category-signature result
  classifierCalls: number;
  pending: number;
  avoidedPct: number; // 1 - classifierCalls / totalVisible
}

export interface LogEntry {
  key: string;
  title: string;
  tier: string;
  detail: string;
}

export const signature = (item: Item) => `${item.merchant}:${item.brand}:${item.breadcrumb.join(">")}`;
const keyOf = (item: Item) => `${item.merchant}:${item.id}`;

/** Visible-only, memoized evaluation with a per-category-signature cache for classifier answers. */
export class Resolver {
  private results = new Map<string, ItemResult>();
  private inflight = new Map<string, Promise<ItemResult>>();
  private cache = new Map<string, { id: string; p: number }>();
  private listeners = new Set<() => void>();
  private counters = { totalVisible: 0, ruleResolved: 0, classifierResolved: 0, cacheHits: 0, classifierCalls: 0 };
  private statsSnap: ResolverStats;
  private logArr: LogEntry[] = [];
  private logSnap: LogEntry[] = [];

  constructor(
    private rules: Record<MerchantId, MerchantRules>,
    private classifier: Classifier,
  ) {
    this.statsSnap = this.computeStats();
  }

  get classifierName() {
    return this.classifier.name;
  }

  /** True when the last Jev call fell back to the mock classifier. */
  get fellBack() {
    return (this.classifier as { lastFellBack?: boolean }).lastFellBack === true;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStats = () => this.statsSnap;
  getLog = () => this.logSnap;
  get = (item: Item): ItemResult | undefined => this.results.get(keyOf(item));
  has = (item: Item) => this.results.has(keyOf(item)) || this.inflight.has(keyOf(item));

  private computeStats(): ResolverStats {
    const c = this.counters;
    return {
      ...c,
      pending: this.inflight.size,
      avoidedPct: c.totalVisible === 0 ? 0 : (1 - c.classifierCalls / c.totalVisible) * 100,
    };
  }

  private publish() {
    this.statsSnap = this.computeStats();
    this.logSnap = [...this.logArr];
    this.listeners.forEach((l) => l());
  }

  private record(item: Item, r: ItemResult, detail: string) {
    this.results.set(keyOf(item), r);
    this.logArr = [{ key: keyOf(item), title: item.title, tier: r.tier, detail }, ...this.logArr].slice(0, 12);
  }

  /** Evaluate an item once. Later calls for the same item return the memoized result. */
  resolve(item: Item): Promise<ItemResult> {
    const key = keyOf(item);
    const done = this.results.get(key);
    if (done) return Promise.resolve(done);
    const running = this.inflight.get(key);
    if (running) return running;

    this.counters.totalVisible++;
    const rules = this.rules[item.merchant];
    const { result, needsClassifier } = evaluateRules(item, rules);

    if (!needsClassifier) {
      this.counters.ruleResolved++;
      this.record(item, result, result.tier === "default" ? "default rate" : "rule match");
      this.publish();
      return Promise.resolve(result);
    }

    const sig = signature(item);
    const cached = this.cache.get(sig);
    if (cached) {
      this.counters.cacheHits++;
      const r = applyChoice(item, rules, cached.id, cached.p);
      this.record(item, r, "cache hit (category signature)");
      this.publish();
      return Promise.resolve(r);
    }

    this.counters.classifierCalls++;
    const started = Date.now();
    const p = this.classifier
      .classify(item, needsClassifier.candidates)
      .then((dist) => {
        const best = [...dist].sort((a, b) => b.p - a.p)[0];
        this.cache.set(sig, best);
        this.counters.classifierResolved++;
        const r = applyChoice(item, rules, best.id, best.p);
        this.inflight.delete(key);
        this.record(item, r, `classifier via ${dist.via ?? this.classifier.name} in ${Date.now() - started} ms (${needsClassifier.reason})`);
        this.publish();
        return r;
      })
      .catch(() => {
        this.counters.classifierResolved++;
        this.inflight.delete(key);
        this.record(item, result, "classifier failed, kept rule answer");
        this.publish();
        return result;
      });
    this.inflight.set(key, p);
    this.publish();
    return p;
  }

  request(item: Item): void {
    void this.resolve(item);
  }
}
