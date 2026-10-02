import type { Exclusion, Item, RateRow } from "./schema";

export type Candidate = RateRow | Exclusion;
export type Status = "eligible" | "excluded" | "unknown";
export type Tier = "rule" | "classifier" | "default";

export const DEFAULT_ID = "__default__";
export const EXCLUDED_ID = "__excluded__";

export interface ItemResult {
  status: Status;
  rate: number; // percent, 0 when not eligible
  amount: number; // dollars, price x quantity x rate / 100, excluding tax and shipping
  confidence: number;
  tier: Tier;
  matchedRowId?: string;
  matchedExclusionId?: string;
  reason: string;
  assumed?: boolean; // rate is a placeholder not found in the supplied terms
}

export interface ClassifierRequest {
  reason: "weak_signal" | "tie" | "conflict" | "unresolved";
  candidates: Candidate[];
}

export interface RuleOutcome {
  result: ItemResult;
  needsClassifier: ClassifierRequest | null;
}

export type { Item };
