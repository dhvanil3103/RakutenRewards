import { ItemSchema, MerchantRulesSchema, type Item, type MerchantId, type MerchantRules } from "../engine/schema";
import bbCatalog from "./catalog/bestbuy.json";
import nkCatalog from "./catalog/nike.json";
import mcCatalog from "./catalog/macys.json";
import bbRules from "./rules/bestbuy.json";
import nkRules from "./rules/nike.json";
import mcRules from "./rules/macys.json";
import { z } from "zod";

export const RULES: Record<MerchantId, MerchantRules> = {
  bestbuy: MerchantRulesSchema.parse(bbRules),
  nike: MerchantRulesSchema.parse(nkRules),
  macys: MerchantRulesSchema.parse(mcRules),
};

const parseCatalog = (raw: unknown): Item[] => z.array(ItemSchema).parse(raw);
export const CATALOG: Record<MerchantId, Item[]> = {
  bestbuy: parseCatalog(bbCatalog),
  nike: parseCatalog(nkCatalog),
  macys: parseCatalog(mcCatalog),
};

export const STORES: { id: MerchantId; name: string; wordmark: string; color: string; ink: string; tagline: string }[] = [
  { id: "bestbuy", name: "Best Buy", wordmark: "Best Buy (mock)", color: "#0046be", ink: "#ffffff", tagline: "Electronics and appliances" },
  { id: "nike", name: "Nike", wordmark: "Nike (mock)", color: "#111111", ink: "#ffffff", tagline: "Shoes, apparel, gear" },
  { id: "macys", name: "Macy's", wordmark: "Macy's (mock)", color: "#c8102e", ink: "#ffffff", tagline: "Fashion, home, beauty" },
];

export const findItem = (m: MerchantId, id: string) => CATALOG[m].find((i) => i.id === id);
