import { z } from "zod";

export const MatchSchema = z
  .object({
    brandAny: z.array(z.string()).optional(),
    pathAny: z.array(z.string()).optional(),
    titleAny: z.array(z.string()).optional(),
    seller: z.enum(["merchant", "third_party"]).optional(),
    flagsAll: z.array(z.string()).optional(),
    notBrandAny: z.array(z.string()).optional(),
    notPathAny: z.array(z.string()).optional(),
    // Small extension to the brief: lets "excluding digital downloads" be expressed.
    notFlagsAny: z.array(z.string()).optional(),
  })
  .strict();

export const RateRowSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    rate: z.number().min(0).max(100),
    match: MatchSchema,
    source: z.string(),
  })
  .strict();

export const ExclusionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    match: MatchSchema,
    scope: z.enum(["item", "order"]),
    reason: z.string(),
    source: z.string(),
  })
  .strict();

export const OrderRuleSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "max_same_sku_qty",
      "review_over_amount",
      "void_all_on_returns",
      "reduce_base_by_store_credit",
      "non_us_excluded",
      "info",
    ]),
    params: z.record(z.string(), z.union([z.number(), z.string()])),
    message: z.string(),
  })
  .strict();

export const MerchantRulesSchema = z
  .object({
    merchantId: z.enum(["bestbuy", "nike", "macys"]),
    name: z.string(),
    calcBasis: z.string(),
    defaultRate: z
      .object({ rate: z.number(), label: z.string(), assumed: z.boolean().optional() })
      .nullable(),
    rateRows: z.array(RateRowSchema),
    exclusions: z.array(ExclusionSchema),
    orderRules: z.array(OrderRuleSchema),
    specificityOverridesExclusions: z.boolean(),
    specialTerms: z.array(z.string()),
  })
  .strict();

export type Match = z.infer<typeof MatchSchema>;
export type RateRow = z.infer<typeof RateRowSchema>;
export type Exclusion = z.infer<typeof ExclusionSchema>;
export type OrderRule = z.infer<typeof OrderRuleSchema>;
export type MerchantRules = z.infer<typeof MerchantRulesSchema>;
export type MerchantId = MerchantRules["merchantId"];

export const ItemSchema = z.object({
  id: z.string(),
  merchant: z.enum(["bestbuy", "nike", "macys"]),
  title: z.string(),
  brand: z.string(),
  breadcrumb: z.array(z.string()),
  price: z.number(),
  seller: z.enum(["merchant", "third_party"]),
  flags: z.array(z.string()),
});
export type Item = z.infer<typeof ItemSchema>;
