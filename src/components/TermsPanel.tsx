import { useEffect, useRef } from "react";
import type { MerchantId } from "../engine";
import { TERMS } from "../data/terms";

const RATE_HEADING = /^\d+(\.\d+)?% Cash Back/;
const SECTION = /^(Terms & Exclusions|Top .* Categories|Special Terms:?)/;

/** The merchant's raw Terms & Conditions, shown beside the shop so products can be compared against them. */
export function TermsPanel({ merchant, name, onClose }: { merchant: MerchantId; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = TERMS[merchant].split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <>
      <div className="terms-backdrop" onClick={onClose} />
      <aside className="terms" role="dialog" aria-modal="true" aria-label={`${name} Terms and Conditions`}>
        <header className="terms-head">
          <h2>{name} Terms &amp; Conditions</h2>
          <button ref={closeRef} className="btn" onClick={onClose}>Close</button>
        </header>
        <div className="terms-body">
          {lines.map((l, i) =>
            RATE_HEADING.test(l) ? <h3 key={i} className="terms-rate">{l}</h3>
            : SECTION.test(l) ? <h3 key={i}>{l}</h3>
            : l.startsWith("- ") ? <p key={i} className="terms-item">{l.slice(2)}</p>
            : <p key={i}>{l}</p>,
          )}
        </div>
        <p className="muted small terms-foot">Supplied terms for this demo. Cash back shown on products is an estimate based on them.</p>
      </aside>
    </>
  );
}
