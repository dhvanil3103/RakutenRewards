import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useExtension } from "../app/ExtensionContext";
import { ProductCard } from "../components/ProductCard";
import { CATALOG } from "../data";
import type { MerchantId } from "../engine";

export default function Listing() {
  const merchant = useParams().storeId as MerchantId;
  const { setPageItems, active, activate } = useExtension();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const items = CATALOG[merchant];
  const cats = useMemo(() => ["All", ...new Set(items.map((i) => i.breadcrumb[0] ?? "Other"))], [items]);
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (cat === "All" || (i.breadcrumb[0] ?? "Other") === cat) &&
          `${i.title} ${i.brand}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [items, q, cat],
  );
  useEffect(() => setPageItems(shown), [shown, setPageItems]);

  return (
    <>
      {!active && (
        <div className="hint" role="note">
          Cash back is off. <button className="link" onClick={activate}>Activate Cash Back</button> to see the rate on each product as you scroll.
        </div>
      )}
      <div className="filters">
        <input type="search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={`chip ${c === cat ? "sel" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid">
        {shown.map((i) => (
          <ProductCard key={i.id} item={i} />
        ))}
      </div>
      {shown.length === 0 && <p className="muted">No products match.</p>}
    </>
  );
}
