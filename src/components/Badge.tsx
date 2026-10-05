import { useExtension, type DisplayMode } from "../app/ExtensionContext";
import { amountFor, type ItemResult } from "../engine";

export type Where = "listing" | "detail" | "cart";

export function effectiveMode(mode: DisplayMode, where: Where): "percent" | "dollar" {
  if (mode === "auto") return where === "listing" ? "percent" : "dollar";
  return mode;
}

const END = "Estimate. Final determination by merchant.";
const money = (n: number) => `$${n.toFixed(2)}`;

export function Badge({ result, price, quantity = 1, where, pending }: { result?: ItemResult; price: number; quantity?: number; where: Where; pending?: boolean }) {
  const { active, mode, threshold } = useExtension();
  if (active && pending && !result) {
    return (
      <span className="badge badge-loading" role="status" aria-label="Checking cash back">
        <span className="dots" aria-hidden="true"><i /><i /><i /></span> Checking
      </span>
    );
  }
  if (!active || !result || result.status === "unknown") return null;

  const shown = effectiveMode(mode, where);
  const amount = result.status === "eligible" ? amountFor(price, quantity, result.rate) : 0;
  const tip = (text: string) => (
    <span className="tip" role="tooltip">
      {text} {END}
    </span>
  );

  if (result.status === "excluded") {
    return (
      <span className="badge badge-excluded" tabIndex={0}>
        No cash back
        {tip(result.reason)}
      </span>
    );
  }
  const label = shown === "percent" ? `${result.rate}%` : `~${money(amount)}`;
  if (result.assumed) {
    return (
      <span className="badge badge-est" tabIndex={0}>
        {label} est.
        {tip("Rate not in supplied terms; placeholder value.")}
      </span>
    );
  }
  if (result.confidence < threshold) {
    return (
      <span className="badge badge-check" tabIndex={0}>
        Check terms
        {tip(`${result.reason} Confidence ${(result.confidence * 100).toFixed(0)}% is below the ${(threshold * 100).toFixed(0)}% threshold (would be ${label} back).`)}
      </span>
    );
  }
  return (
    <span className="badge badge-ok" tabIndex={0}>
      {label} back
      {tip(result.reason)}
    </span>
  );
}
