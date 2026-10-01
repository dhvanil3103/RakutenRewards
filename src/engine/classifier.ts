import type { Item } from "./schema";
import { overlapScore } from "./text";
import { DEFAULT_ID, EXCLUDED_ID, type Candidate } from "./types";

export interface Classifier {
  name: string;
  // Choice over candidate rate rows plus an "excluded" option; returns probabilities.
  classify(item: Item, candidates: Candidate[]): Promise<{ id: string; p: number }[]>;
}

export type ClassifierKind = "mock" | "jev" | "llm";

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
    const scores = candidates.map((c) =>
      c.id === DEFAULT_ID ? DEFAULT_BASE : c.id === EXCLUDED_ID ? EXCLUDED_BASE : overlapScore(item, c),
    );
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp((s - max) / this.temperature));
    const sum = exps.reduce((a, b) => a + b, 0);
    return candidates.map((c, i) => ({ id: c.id, p: exps[i] / sum }));
  }
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
      return this.fallback.classify(item, candidates);
    }
    try {
      const criteria: Record<string, string> = {};
      for (const c of candidates) criteria[c.id] = c.id === EXCLUDED_ID || c.id === DEFAULT_ID ? c.label : `${c.label} (${c.source})`;
      // Direct calls need the key here (and the API blocks browser origins); via a proxy the server adds it.
      const res = await fetch(this.opts.url ?? "https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { title: item.title, brand: item.brand, breadcrumb: item.breadcrumb, seller: item.seller, flags: item.flags },
          model: this.opts.model ?? "jev-latest",
          questions: {
            category: {
              type: "choice",
              instructions: "Which cash back category from the merchant's terms does this product belong to?",
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
      return Object.entries(probs).map(([id, p]) => ({ id, p }));
    } catch {
      this.lastFellBack = true;
      return this.fallback.classify(item, candidates);
    }
  }
}

/** Placeholder for a general LLM backend. TODO: implement a structured-output call; falls back to the mock. */
export class LLMAdapter implements Classifier {
  name = "LLM adapter (stub, falls back to mock)";
  private fallback = new MockClassifier();
  classify(item: Item, candidates: Candidate[]) {
    return this.fallback.classify(item, candidates);
  }
}

export function createClassifier(kind: ClassifierKind, opts: { jevApiKey?: string; jevProxyUrl?: string } = {}): Classifier {
  if (kind === "jev") return new JevAdapter({ apiKey: opts.jevApiKey, url: opts.jevProxyUrl, viaProxy: !!opts.jevProxyUrl });
  if (kind === "llm") return new LLMAdapter();
  return new MockClassifier();
}
