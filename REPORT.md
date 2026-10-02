# Cash Back Overlay Demo: How It Works

A fully mocked web demo of a browser-extension-style overlay. It reads a merchant's Terms & Conditions (T&C) as structured rules, then marks each product the shopper can see with an estimated cash back, and totals it in the cart.

- Three fake merchants: **Best Buy**, **Nike**, **Macy's**. Fake products, fake prices, no real merchant calls, no accounts, no payments.
- Core principle: **do not call a model per product.** Resolve with deterministic rules first, cache by category, and use a classifier only for what rules cannot settle. The debug panel shows how many classifier calls were avoided.

---

## 1. The flow in one picture

```
 product scrolls into view
          |
          v
  +-------------------+     clear answer      +-----------------------+
  | Deterministic     | --------------------> | Badge: "4% back",     |
  | rule matching     |                       | "No cash back", ...   |
  +-------------------+                       +-----------------------+
          | cannot finalize
          | (weak breadcrumb / tie / conflict)
          v
  +-------------------+   hit   +-----------+
  | Cache by category | ------> | reuse the |
  | signature         |         | answer    |
  +-------------------+         +-----------+
          | miss
          v
  +-------------------+
  | Classifier        |  Mock (offline)  or  Jev (real API via proxy)
  | picks one option  |
  +-------------------+
          |
          v
   probabilities -> top option = answer, its probability = confidence
```

Each product is evaluated **once**, and **only after it first becomes visible** on screen.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Cash back** | A percentage of the item price returned to the shopper. Estimated here, never real. |
| **T&C (Terms & Conditions)** | The merchant's published rules: rates per category, exclusions, special terms. The source of truth. Raw text is saved verbatim in `src/data/terms/`. |
| **Rate row** | One line like "7.5% Cash Back - Sony Headphones". Has an id, label, rate, match conditions and a `source` (the verbatim T&C label). |
| **Exclusion** | A line like "Cash Back is not available on Apple Products". Items matching it earn nothing. Has a `reason` that quotes the T&C. |
| **Default rate** | What an item earns when it matches no rate row and no exclusion. Best Buy 1% ("All Other Non-Excluded Items"), Macy's 4% ("All Other Categories"), Nike 2% (a placeholder, see Section 8). |
| **Order rule** | A rule about the whole order, not one item: max same-SKU quantity, store credit, non-US orders, returns, review amount, info notes. |
| **Breadcrumb** | The category trail on a product page, e.g. `Audio > Headphones > Over-Ear Headphones`. Stored as a list of strings. The rules mostly match on words in it. |
| **Weak signal** | A breadcrumb that tells the rules nothing: missing, fewer than 2 segments, or only generic words (Deals, Sale, Featured, Clearance, New, Trending...). |
| **Flags** | Tags on a product used by some rules: `giftCard`, `newRelease`, `digitalDownload`, `healthFitness`, `selectLenovo`... |
| **Seller** | `merchant` (sold by the store) or `third_party` (marketplace). Some rates and exclusions depend on it. |
| **Specificity** | How narrow a rule's match is. More specific rules win. See Section 3. |
| **Tier** | Which stage answered: `rule`, `classifier`, or `default`. |
| **Confidence** | How sure the answer is, 0 to 1. Compared against the threshold slider. |
| **Threshold** | The slider (default 0.70). Eligible items below it show a dashed "Check terms" chip instead of a rate. |
| **Classifier** | A component that picks one option from a list and returns a probability for each. Two backends: Mock and Jev. |
| **Mock classifier** | Offline, deterministic stand-in: word overlap + softmax. Not a real model. |
| **Jev** | TypeSafe's "System One" model. Given text and a multiple-choice question, it returns calibrated probabilities in roughly 100-400 ms. |
| **Candidate** | One option offered to the classifier: a rate row, an exclusion, "default rate", or "not eligible". |
| **Category signature** | The cache key `merchant:brand:breadcrumb`. Products sharing it reuse a classifier answer. |
| **Cache hit** | A product that needed the classifier but reused a result for its signature. No call made. |
| **Classifier calls avoided** | `1 - classifier calls / products evaluated`. The headline cost-control number. |
| **Visible-only evaluation** | A product is evaluated the first time it is at least 50% on screen (with a 100 px margin), never before, never twice. |
| **Star Dollars** | Macy's store credit (mock). The part of an order paid with it earns no cash back. |
| **Golden fixtures** | 63 labeled products and cart cases used by `npm run eval` to measure accuracy. |

---

## 3. Deterministic rule matching

No model and no network. Inputs: one product (`title, brand, breadcrumb, price, seller, flags`) and the merchant's rules file.

### 3.1 Match conditions

A rule's `match` can use these fields. **All specified fields must hold.**

| Field | True when |
|---|---|
| `brandAny` | the brand equals one of the listed brands (case-insensitive, exact) |
| `pathAny` | any breadcrumb segment contains one of the keywords |
| `titleAny` | the title contains one of the keywords |
| `seller` | merchant or third_party matches |
| `flagsAll` | the product has all the listed flags |
| `notBrandAny` | the brand is not one of the listed brands |
| `notPathAny` | no breadcrumb segment contains the keywords |
| `notFlagsAny` | the product has none of the listed flags (an addition to the original schema, used for "excluding digital downloads") |

### 3.2 Specificity weights

| Constraint | Weight |
|---|---|
| `brandAny` | 3 |
| `pathAny` | 2 |
| `titleAny` | 2 |
| `flagsAll` | 2 |
| `seller` | 1 |
| each `not...` field | 0.25 (tie-break only) |

So brand + path (5) beats brand only (3) beats path only (2). Example: "Sony Headphones" (brand + path = 5) beats "All Headphones" (path + a not-field = 2.25).

### 3.3 Evaluation order for one product

1. Collect all matching rate rows and all matching item-level exclusions.
2. Take the highest-specificity rate row. If two top rows tie **with different rates**, take the lower rate and send the product to the classifier (a tie with equal rates, such as two 2% Switch rows, is not a real tie).
3. Decide:
   - **Exclusion only** -> `excluded`, reason quoted from the T&C.
   - **Rate row only** -> `eligible` at that rate, confidence 0.95.
   - **Both match** -> at Best Buy, the rate row wins only if it is **strictly more specific** than the exclusion (Ring, Blink, Dell laptops, Switch consoles, Lenovo ThinkPad). That is a *conflict* and goes to the classifier. At Macy's and Nike the exclusion always wins.
   - **Neither** -> the merchant's default rate (confidence 0.9, or 0.5 when the rate is a placeholder).
4. **Amount** = price x quantity x rate / 100, rounded to cents. Tax and shipping are never part of the base.

### 3.4 What happens when the rules cannot finalize

Anything not settled by the rules goes to the classifier:

| `reason` in the debug log | Trigger |
|---|---|
| `weak_signal` | breadcrumb missing, under 2 segments, or only generic words |
| `tie` | two top rate rows with different rates |
| `conflict` | a more specific listed rate overrides a general exclusion |
| `unresolved` | no usable answer at all (cannot occur with today's rules since every merchant has a default) |

Still final from rules alone: clear rate matches, plain exclusions (AirPods), exclusion-wins cases at Macy's and Nike, and the default rate.

### 3.5 Worked examples (Best Buy)

| Product | Breadcrumb | What happens | Result |
|---|---|---|---|
| Sony WH-1000XM5 | Audio > Headphones > Over-Ear | "Sony Headphones" (5) beats "All Headphones" (2.25) | 7.5%, rule |
| JLab earbuds | Audio > Headphones > ... | "JLab Headphones" (5) beats the general rows | 2%, rule |
| AirPods | Audio > Headphones > ... | Brand Apple matches the Apple exclusion; no rate row matches | excluded, rule |
| Beats Studio | Audio > Headphones > ... | "All Non-Apple Headphones" (2.25) loses to the Beats exclusion (3) | excluded, rule |
| Ring doorbell | Smart Home > Security & Monitoring > ... | "Ring Home Security" (5) vs "Security" exclusion (2): conflict | classifier decides |
| Generic HP laptop | Computers > Laptops > ... | Only the "Laptops & Desktops" exclusion matches | excluded, rule |
| Sonos Era 100 | `["Deals"]` | Weak breadcrumb; no rule can fire | classifier decides |

---

## 4. The classifier tier

### 4.1 What is built and sent

1. **Shortlist (local).** Rules whose label shares words with the product are ranked (brand overlap scores 3, title word 1.5, path word 1; generic breadcrumb words never count). Up to 8 are kept. If none overlap, the classifier gets **every** rate row and exclusion for that merchant, so no product is skipped.
2. Two fixed options are always added: **default rate** (when the merchant has one) and **not eligible**.
3. The classifier returns a probability per option. The **top option is the answer; its probability is the confidence.**

### 4.2 Mock classifier (default)

- Offline and **deterministic**: the same product always gives the same output.
- Scores each candidate by word overlap with the product text (brand 3, title 1.5, path 1), gives "default" a fixed prior of 1.0 and "not eligible" 0.5, then applies a softmax (temperature 1).
- Options with zero overlap are dropped before scoring so they do not dilute the priors.
- It is a stand-in for a real model, not a real classifier.

### 4.3 Jev adapter

- **Non-deterministic**: repeated identical calls vary slightly (for example 0.90, 0.91, 0.91, 0.93). Small jitter can flip a "Check terms" chip near the threshold, though the chosen category rarely changes.
- **Request** (`POST https://api.typesafe.ai/v1/systemone`, Bearer auth):
  ```
  state:     { title, brand, breadcrumb, seller, flags }
  model:     "jev-latest"
  questions: { category: { type: "choice",
               instructions: "...decide mainly from title and brand...",
               criteria: { "<option id>": "<T&C wording + what choosing it means>", ... } } }
  ```
- **What each option description says:** e.g. `Sonos Home Audio & Speakers: earns 2% cash back. T&C line: "2% Cash Back - Sonos Home Audio & Speakers"` or `Excluded: HyperIce products. The product earns NO cash back. T&C: "..."`.
- **Instructions** explain the task, say the breadcrumb is often missing, and add that when a specific listed rate and a general exclusion both seem to apply, the specific rate wins unless the product clearly belongs to the excluded group (the author's reading of Best Buy's T&C).
- **Not sent:** price, product id, cart contents, or the catalog.
- **Response:** `answers.category.probabilities` (option id -> probability). The adapter uses these only.
- **Proxy:** the API does not allow browser-origin (CORS) requests, and a key in client code is public. In dev, a Vite proxy (`/api/jev`) adds the key server-side from `VITE_JEV_API_KEY`. A production deployment needs a real backend proxy.
- **Fallback:** on any failure (no key, proxy missing, API error) it falls back to the mock, and the debug panel shows a warning. Each log line says which backend answered, e.g. `classifier via Jev in 135 ms (weak_signal)`.
- Verified live: HTTP 200, option ids containing underscores accepted, roughly 100-400 ms per call, option lists up to 108 entries worked. After adding T&C wording to the option text, Jev agreed with the mock on all weak-signal products tested, at generally higher confidence.

### 4.4 Cost control

- **Cache key:** `merchant:brand:breadcrumb`. Only classifier answers are cached. Rule results are not, because they also depend on flags, seller and title, which are not in the key.
- **Counters** (all shown in the debug panel): visible evaluations, resolved by rule, resolved by classifier, cache hits, classifier calls made, and `classifier calls avoided = 1 - calls / evaluations`.
- On the golden set with the mock: 10 classifier calls over 59 evaluations (83% avoided).

---

## 5. Visible-only evaluation

- Nothing is evaluated before activation. Before activation there are no badges anywhere.
- After activation, an `IntersectionObserver` (threshold 0.5, rootMargin 100 px) watches every product card. The first time one is visible, it is evaluated.
- Results are memoized per product, so scrolling back never re-evaluates.
- The debug panel shows "Evaluated on this page: N / M" and a bar. Cards are outlined: solid green when evaluated, dashed when not yet seen. In testing, 8 of 48 products were evaluated right after activation and about 20 after scrolling.
- Cart lines are always on screen, so the cart requests all its lines at once through the same memoized resolver.

---

## 6. Badges

| Badge | Shown when | Tooltip |
|---|---|---|
| `4% back` / `~$12.40 back` | eligible, confidence at or above the threshold | the matched T&C line |
| `Check terms` (dashed grey) | eligible but confidence below the threshold | why, plus the confidence vs the threshold |
| `No cash back` (grey) | excluded | the reason, quoted from the T&C |
| `2% est.` / `~$x est.` (dashed green) | Nike's placeholder rate | "Rate not in supplied terms; placeholder value." |
| nothing | unknown status, not yet evaluated, or extension off | n/a |

Every tooltip ends with "Estimate. Final determination by merchant."

**Display modes:** Percent, Dollar, or Auto (percent on listing cards, estimated dollars on the product page and in the cart). Dollars are price x rate, excluding tax and shipping.

---

## 7. The cart

Per line: quantity controls, remove, a badge, and the line's cash back in dollars.

Summary: subtotal, tax (mock 8%, labeled "not eligible"), shipping (mock $7.99, free at $100+), order total, then **Estimated cash back $X (Y% of subtotal)** and a "Not earning cash back" list with reasons.

Order-level rules:

| Merchant | Rule | Effect |
|---|---|---|
| Best Buy | 6 or more of the same SKU | that line becomes excluded |
| Best Buy | info lines | "Missing Cash Back must be reported within 30 days" and "Only orders completed through the Best Buy US site" |
| Macy's | Star Dollars input | the portion paid with Star Dollars does not qualify; every line's cash back is scaled by `(subtotal - Star Dollars) / subtotal` |
| Nike | "Ship to a non-US address" | all lines excluded |
| Nike | "Simulate a return, exchange or cancellation" | the whole order's cash back becomes $0 with the T&C message |
| Nike | order total over $500 | warning: "Orders over $500 may be subject to review and reversal" |
| Nike | info line | "Cash Back can only be researched for up to 60 days from the order date" |

Items added to the cart before activation are flagged, and a banner warns "Items added before activation may not earn cash back."

---

## 8. The three merchants

| | Best Buy | Macy's | Nike |
|---|---|---|---|
| Rate rows | 78 (1% to 8%) | 3 (all 1.5%) | 0 |
| Exclusions | 30 (some order-level) | 13 (some order-level) | 12 (some order-level) |
| Default rate | 1% | 4% | 2% (placeholder) |
| Specific rate can override an exclusion | yes | no | no |
| Catalog size | 48 | 44 | 41 |
| Messy-breadcrumb products | 6 | 6 | 6 |

**Nike's placeholder rate:** the supplied T&C has no rate table. A 2% default is used and marked `assumed` (confidence 0.5), shown as an estimate with the tooltip "Rate not in supplied terms; placeholder value."

**Best Buy specifics:** the T&C contains a contradiction: "All Headphones (excluding Apple and Beats)" at 6% and "All Non-Apple Headphones" at 3%. Both are encoded as written, so a generic headphone is a tie and goes to the classifier. Rows like "Select Lenovo Laptops" are keyed on a made-up flag (`selectLenovo`), because the T&C does not say which laptops are "select".

---

## 9. Extension simulator

A bar at the top of every store page:

- **Activate / Deactivate Cash Back.** Activating starts a fresh session (counters and cache reset).
- **Display mode:** Percent, Dollar, Auto.
- **Confidence threshold slider** (default 0.70). Changes which badges become "Check terms" instantly; nothing is re-evaluated.
- **Classifier backend select:** Mock (default) or Jev adapter. Switching resets counters.
- **Debug panel toggle:** evaluated vs on-page, the counters above, which backend is in use, and the latest evaluations with tier, backend and latency.

A fixed bottom banner states the demo is mock and unaffiliated: "Demo mock. Not affiliated with Best Buy, Nike, Macy's, or Rakuten. Products and prices are fake. Cash back shown is an estimate."

---

## 10. Evaluation and tests

- `npm run eval` runs 63 golden fixtures (Best Buy 34, Macy's 17, Nike 12) through the same resolver, prints per-merchant accuracy, tier counts and any mismatches with their reason, and exits non-zero if rule-tier accuracy falls below 95%. Current result: **100% overall, 100% rule-tier**, 0 mismatches. It uses the mock classifier.
- `npm test` runs 20 Vitest unit tests: specificity ordering, precedence, conflict handling, rounding, Star Dollars base reduction, the 6-SKU rule, memoization, signature caching, and weak-signal routing.
- The golden set includes the tricky cases from the brief: Ring overriding the Security exclusion, Beats and AirPods excluded, JLab beating the general headphone rate, Nintendo Switch conflict, third-party Apple excluded, 6 of one SKU excluded, Star Dollars partial payment, Nike non-US and return-voids-everything.
- The Jev path is not covered by the automated tests; it was verified by hand against the live API.

---

## 11. Project layout

```
src/
  engine/            pure TypeScript, no React imports (could ship in an extension)
    schema.ts        zod schemas and types for rules and items
    match.ts         matching and specificity
    evaluate.ts      rule evaluation, conflict/tie/weak-signal routing
    text.ts          tokenizing, weak-signal check, word-overlap scoring
    classifier.ts    Classifier interface, Mock, Jev adapter
    resolver.ts      visible-only memoization, signature cache, counters
    cart.ts          order-level rules and totals
  data/
    terms/           raw T&C text, saved verbatim
    rules/           hand-authored rules JSON (validated with zod)
    catalog/         fake products per store
  eval/              golden fixtures and the eval runner
  app, components, pages, hooks/   the React storefronts, bar, badges, cart, debug panel
scripts/compile-rules.ts   validates rules; with --llm compiles them from the raw T&C
vite.config.ts             dev proxy that adds the Jev key server-side
ASSUMPTIONS.md             judgement calls made while building
```

---

## 12. Commands

```
npm run dev      # the three mock stores (Jev calls go through the dev proxy)
npm test         # engine unit tests
npm run eval     # golden-set accuracy table
npm run build    # type-check + production build
```

To use Jev: put the key in `.env` as `VITE_JEV_API_KEY=...` (git-ignored) and restart `npm run dev`. Pick "Jev adapter" in the bar; the terminal prints each proxied request, and the debug panel logs which backend answered.

---

## 13. Known limits

- The classifier cache key is the brand and breadcrumb, as specified. Two products sharing both but needing different answers would reuse the first result. Nothing in the current catalog triggers this.
- Jev is non-deterministic, so a confidence near the threshold can flip between runs.
- The Jev proxy exists only in the dev server.
- Flags such as `selectLenovo` are demo stand-ins; a real page would not expose them.
- Everything is an estimate. Real merchants make the final determination.
