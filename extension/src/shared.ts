import type { Item } from "../../src/engine";
import type { Candidate } from "../../src/engine";

export interface Settings {
  enabled: boolean;
  threshold: number;
  backendUrl: string;
}

export const DEFAULTS: Settings = {
  enabled: true,
  threshold: 0.7,
  backendUrl: "http://localhost:5173/api/jev/v1/systemone",
};

export async function loadSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get(DEFAULTS as unknown as Record<string, unknown>);
  return { ...DEFAULTS, ...(s as Partial<Settings>) };
}

export type ClassifyRequest = { type: "classify"; item: Item; candidates: Candidate[] };
export type ClassifyResponse = { ok: true; dist: { id: string; p: number }[]; via?: string; fellBack: boolean } | { ok: false };
