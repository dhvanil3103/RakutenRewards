# Assumptions

Choices made where the brief was ambiguous.

## Rules and matching
- **Specificity is weighted, not a plain count.** Brand 3, path 2, title 2, flags 2, seller 1; negative constraints (`notBrandAny` etc.) add 0.25 as a tie-break. This is what makes "brand + path beats brand only beats path only" hold.
- **A specific rate only overrides an exclusion if it is strictly more specific** and the merchant sets `specificityOverridesExclusions`. Otherwise "Apple (third-party seller)" would earn the generic third-party 1%. Overridden items get confidence 0.6 and the conflict reason from the brief.
- **Macy's and Nike (`specificityOverridesExclusions: false`):** an exclusion always beats a rate row (a Fitbit is electronics at 1.5% but also Health/Fitness, which is excluded).
- **`notFlagsAny` was added to the Match schema** so "Video Games (excluding digital downloads)" can be written as a rule.
- **Ties only count when the rates differ.** Switch and Switch 2 console rows both pay 2%, so they are not a real tie. A genuine tie (for example generic headphones: 6% vs 3%) takes the lower rate, caps confidence at 0.6 and goes to the classifier.
- **Weak category signal** = fewer than 2 breadcrumb segments or only generic words (Deals, Sale, Featured, ...). These items always go to the classifier, never skipped. The shortlist is the (up to 8) rule labels that share words with the item; if none do, the classifier gets every row and exclusion for that merchant. Generic breadcrumb words never count as overlap. The mock ignores zero-overlap options when scoring.
- **Best Buy "Select ..." rows** (Select Lenovo Laptops, Select TVs, Select Third-Party Seller Items) are keyed on flags (`selectLenovo`, `selectTv`, `selectThirdParty`) because the T&C does not say which products count. "Select AMD Gaming Devices" and "Top Deals" are encoded but nothing in the fake catalog exercises them.
- **"All Other Non-Excluded Items" (1%)** is the Best Buy `defaultRate`. Order-level exclusions with no item signal (employee orders, reseller volume, wine shop, adjustments) are listed with `scope: "order"` and shown as info lines; the engine does not match items against them.
- **"All Headphones" (6%) and "All Non-Apple Headphones" (3%) conflict in the supplied text.** Both are encoded as written; the generic case is a tie and goes to the classifier.

## Cart
- Mock tax 8% of subtotal, never part of the base. Mock shipping $7.99, free at $100 or more. Nike's $500 warning uses the order total (subtotal + tax + shipping).
- Cart lines are always on screen, so the cart evaluates all lines at once rather than via the visibility observer. Cart lines still go through the same memoized resolver.
- Star Dollars: factor = (subtotal - Star Dollars) / subtotal applied to every line's cash back; capped at the subtotal.
- Items added before activation are flagged and show the banner. Their badges still appear once active.
- The cart is saved in `localStorage`; the extension state is not.

## Nike placeholder rate
- Nike's terms have no rate table. `defaultRate` is 2% with `assumed: true`, confidence 0.5. The UI shows these as `2% est.` / `~$x est.` with the tooltip "Rate not in supplied terms; placeholder value." They are always shown as estimates, regardless of the confidence slider, rather than as "Check terms" (the brief asks for an estimate display here).

## Cost control
- **The cache key is `merchant:brand:breadcrumb`, as specified, and only classifier answers are cached.** Rule results depend on flags, seller and title, which are not part of the signature, so caching them by signature would be wrong. Rules are cheap and run for every product.
- "Classifier calls avoided" = 1 - classifier calls / unique visible evaluations. Cache hits count as avoided calls.
- The mock classifier gets a candidate shortlist (rows/exclusions with any token overlap, up to 8) plus a "default rate" and a "none of these" option, with fixed priors of 1.0 and 0.5.
- Changing the classifier backend, or activating again, starts a new resolver: counters and cache reset.

## Jev adapter
- Request shape from the TypeSafe docs (`POST https://api.typesafe.ai/v1/systemone`, Bearer auth, body `{ state, model, questions }`, one `choice` question with `criteria`, answer's `probabilities`). Verified with a real call: HTTP 200, model `jev-latest` accepted, option ids like `__default__` accepted, about 400 ms.
- The API does not allow browser-origin (CORS) requests, so the app calls it through a Vite dev-server proxy (`/api/jev`, see `vite.config.ts`) that adds the key from `VITE_JEV_API_KEY` server-side. Client code never references the key, so it is not bundled. This only works under `npm run dev`; a production deployment needs a real backend proxy.
- On any failure (no key, proxy missing, API error) it falls back to the mock, and the debug panel shows a warning.
- The Jev question carries task instructions (decide from title and brand, since breadcrumb and flags are missing) and each option's description includes the T&C wording and what it means (earns X%, or earns no cash back). With bare labels Jev disagreed with the mock on 3 of 14 Nike leftovers (no flags set); with this context it agrees on all 14.
- Only the `choice` primitive is used. I did not use the JS SDK (`@typesafe-ai/sdk`), `confidence`, Noul or Score.
- The LLM adapter is a stub (TODO) that falls back to the mock.

## Other
- No logos or real images: tiles are colored blocks with brand initials, derived from a hash of the brand.
- Catalogs: Best Buy 48 products, Nike 41, Macy's 44; 6 per store have messy or missing breadcrumbs.
- Optional stretch: `npm run compile-rules` validates the hand-authored files; `-- --llm` compiles them from the raw T&C via the Anthropic API (needs `ANTHROPIC_API_KEY` and `CLAUDE_MODEL`). The `--llm` path was not run here, only the default validation mode.
