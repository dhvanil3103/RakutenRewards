import type { Item } from "./schema";
import { overlapScore } from "./text";
import { DEFAULT_ID, EXCLUDED_ID, type Candidate } from "./types";

export interface Classifier {
  name: string;
  // Choice over candidate rate rows plus an "excluded" option; returns probabilities.
  classify(item: Item, candidates: Candidate[]): Promise<Distribution>;
}

/** Distribution plus which backend actually produced it (a Jev adapter can fall back to the mock). */
export type Distribution = { id: string; p: number }[] & { via?: string };
const tag = (d: { id: string; p: number }[], via: string): Distribution => Object.assign(d, { via });

export type ClassifierKind = "mock" | "jev";

const DEFAULT_BASE = 1.0; // prior for "use the merchant's default rate"
const EXCLUDED_BASE = 0.5; // prior for "none of these / not eligible"

/**
 * Offline stand-in for a real model. Token overlap between the item text and each
 * candidate's label and keywords, then a softmax. Deterministic. Not a real classifier.
 */
export class MockClassifier implements Classifier {
  name = "Mock (token overlap + softmax, stand-in)";
  constructor(private temperature = 1) {}

  async classify(item: Item, candidates: Candidate[]) {
    // Options with no word overlap carry no evidence; leaving them out keeps the softmax from diluting the priors.
    const synthetic = (c: Candidate) => c.id === DEFAULT_ID || c.id === EXCLUDED_ID;
    candidates = candidates.filter((c) => synthetic(c) || overlapScore(item, c) > 0);
    const scores = candidates.map((c) =>
      c.id === DEFAULT_ID ? DEFAULT_BASE : c.id === EXCLUDED_ID ? EXCLUDED_BASE : overlapScore(item, c),
    );
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp((s - max) / this.temperature));
    const sum = exps.reduce((a, b) => a + b, 0);
    return tag(candidates.map((c, i) => ({ id: c.id, p: exps[i] / sum })), "mock");
  }
}

const INSTRUCTIONS =
  "A shopper is viewing a product on a merchant site. Decide which cash back category from the merchant's Terms & Conditions the product belongs to. " +
  "The product's breadcrumb is often missing or generic (e.g. Deals) and its flags are not available, so decide mainly from the product title and brand, " +
  "using general knowledge of what the product is. Each option is a T&C line and says what it means for cash back. " +
  "Pick the option whose wording the product most plainly falls under. An exclusion option means the product earns no cash back. " +
  "When both a specific listed rate and a general exclusion seem to apply, the more specific listed rate wins unless the product clearly belongs to the excluded group. " +
  "Choose the 'default' option only when no specific option fits, and 'not eligible' only when the product clearly cannot earn cash back.";

/** Option description for Jev: the T&C wording plus what choosing it means. */
function describe(c: Candidate): string {
  if (c.id === DEFAULT_ID) return `Default: ${c.label}. None of the more specific lines fit; ordinary products at this merchant earn this rate.`;
  if (c.id === EXCLUDED_ID) return "Not eligible: the product clearly fits none of the listed categories and cannot earn cash back.";
  if ("rate" in c) return `${c.label}: earns ${c.rate}% cash back. T&C line: "${c.source}".`;
  return `Excluded: ${c.label}. The product earns NO cash back. T&C: "${c.source}".`;
}

/**
 * TypeSafe Jev ("System One") adapter. Request shape taken from https://docs.typesafe.ai/api.md
 * and /primitives/choice.md: POST /v1/systemone, Bearer auth, { state, model, questions }
 * with a "choice" question whose `criteria` maps option keys to descriptions; the answer
 * carries `probabilities`. Verified against the live API (HTTP 200, option ids with underscores are fine).
 * The API rejects browser origins (CORS), so the app calls it through the Vite dev proxy, which adds the key.
 * Falls back to the mock when there is no key/proxy or the call fails.
 */
export class JevAdapter implements Classifier {
  name = "Jev adapter (falls back to mock on error)";
  lastFellBack = false;
  private fallback = new MockClassifier();
  constructor(
    private opts: { apiKey?: string; url?: string; viaProxy?: boolean; model?: string } = {},
  ) {}

  async classify(item: Item, candidates: Candidate[]) {
    const { apiKey, viaProxy } = this.opts;
    if (!apiKey && !viaProxy) {
      this.lastFellBack = true;
      return tag(await this.fallback.classify(item, candidates), "mock (no key/proxy)");
    }
    try {
      const criteria: Record<string, string> = {};
      for (const c of candidates) criteria[c.id] = describe(c);
      const res = await fetch(this.opts.url ?? "https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { title: item.title, brand: item.brand, breadcrumb: item.breadcrumb, seller: item.seller, flags: item.flags },
          model: this.opts.model ?? "jev-latest",
          questions: {
            category: {
              type: "choice",
              instructions: INSTRUCTIONS,
              criteria,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`Jev ${res.status}`);
      const body = (await res.json()) as { answers?: { category?: { probabilities?: Record<string, number> } } };
      const probs = body.answers?.category?.probabilities;
      if (!probs) throw new Error("Jev response had no probabilities");
      this.lastFellBack = false;
      return tag(Object.entries(probs).map(([id, p]) => ({ id, p })), "Jev");
    } catch {
      this.lastFellBack = true;
      return tag(await this.fallback.classify(item, candidates), "mock (Jev call failed)");
    }
  }
}

export function createClassifier(kind: ClassifierKind, opts: { jevApiKey?: string; jevProxyUrl?: string } = {}): Classifier {
  if (kind === "jev") return new JevAdapter({ apiKey: opts.jevApiKey, url: opts.jevProxyUrl, viaProxy: !!opts.jevProxyUrl });
  return new MockClassifier();
}
