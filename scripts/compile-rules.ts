// Default: validate the hand-authored rules with zod.
// --llm: ask an LLM to compile each raw T&C .txt into rules, validate, write to
// src/data/rules.generated/ and print a diff against the hand-authored files.
// Needs ANTHROPIC_API_KEY and CLAUDE_MODEL (a model id) in the environment.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MerchantRulesSchema, type MerchantRules } from "../src/engine/schema";

const root = path.resolve(import.meta.dirname, "../src/data");
const ids = ["bestbuy", "macys", "nike"] as const;
const useLlm = process.argv.includes("--llm");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

async function compile(id: string): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL;
  if (!key || !model) throw new Error("Set ANTHROPIC_API_KEY and CLAUDE_MODEL to use --llm");
  const prompt = `Convert these merchant Terms & Conditions into JSON matching this JSON Schema. Put the verbatim T&C label in each row's "source". Match fields: brandAny, pathAny, titleAny, seller, flagsAll, notBrandAny, notPathAny, notFlagsAny. Reply with JSON only.\n\nSchema:\n${JSON.stringify(z.toJSONSchema(MerchantRulesSchema))}\n\nmerchantId: ${id}\n\nT&C:\n${read(`terms/${id}.txt`)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 32000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const text = ((await res.json()) as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join("");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function diff(hand: MerchantRules, gen: MerchantRules) {
  const rate = (r: MerchantRules) => new Map(r.rateRows.map((x) => [x.label.toLowerCase(), x.rate]));
  const [h, g] = [rate(hand), rate(gen)];
  for (const [label, r] of h) if (!g.has(label)) console.log(`  - missing from generated: ${label} (${r}%)`);
  for (const [label, r] of g) {
    if (!h.has(label)) console.log(`  + extra in generated: ${label} (${r}%)`);
    else if (h.get(label) !== r) console.log(`  ~ rate differs for ${label}: hand ${h.get(label)}% vs generated ${r}%`);
  }
  console.log(`  exclusions: hand ${hand.exclusions.length}, generated ${gen.exclusions.length}`);
}

let failed = false;
for (const id of ids) {
  const hand = MerchantRulesSchema.safeParse(JSON.parse(read(`rules/${id}.json`)));
  if (!hand.success) {
    failed = true;
    console.error(`${id}: hand-authored rules invalid`, hand.error.issues);
    continue;
  }
  console.log(`${id}: hand-authored rules valid (${hand.data.rateRows.length} rate rows, ${hand.data.exclusions.length} exclusions)`);
  if (!useLlm) continue;
  const gen = MerchantRulesSchema.safeParse(await compile(id));
  if (!gen.success) {
    failed = true;
    console.error(`${id}: generated rules failed validation`, gen.error.issues);
    continue;
  }
  fs.mkdirSync(path.join(root, "rules.generated"), { recursive: true });
  fs.writeFileSync(path.join(root, `rules.generated/${id}.json`), JSON.stringify(gen.data, null, 1) + "\n");
  diff(hand.data, gen.data);
}
process.exit(failed ? 1 : 0);
