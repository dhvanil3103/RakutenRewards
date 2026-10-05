// Browser-only (Vite ?raw imports); kept apart from data/index.ts so Node scripts can import the rules.
import type { MerchantId } from "../engine/schema";
import bestbuy from "./terms/bestbuy.txt?raw";
import nike from "./terms/nike.txt?raw";
import macys from "./terms/macys.txt?raw";

export const TERMS: Record<MerchantId, string> = { bestbuy, nike, macys };
