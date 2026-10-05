import { Link } from "react-router-dom";
import { useCart } from "../app/CartContext";
import { useExtension } from "../app/ExtensionContext";
import type { Item } from "../engine";
import { useVisibleEvaluation } from "../hooks/useVisibleEvaluation";
import { Badge } from "./Badge";
import { Tile } from "./Tile";

export const tintFor = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 40% 85%)`;
};

export function ProductCard({ item }: { item: Item }) {
  const { add } = useCart();
  const { debug, active } = useExtension();
  const { ref, result, pending, evaluated } = useVisibleEvaluation<HTMLDivElement>(item);
  return (
    <article className={`card ${debug && active ? (evaluated ? "ev" : "not-ev") : ""}`}>
      <div className="card-media" ref={ref}>
        <Link to={`/${item.merchant}/p/${item.id}`} aria-label={item.title}>
          <Tile brand={item.brand} tint={tintFor(item.brand)} />
        </Link>
        <div className="badge-slot">
          <Badge result={result} pending={pending} price={item.price} where="listing" />
        </div>
        {debug && active && <span className="ev-tag">{evaluated ? "evaluated" : "not evaluated"}</span>}
      </div>
      <div className="card-body">
        <div className="muted small">{item.brand}</div>
        <Link to={`/${item.merchant}/p/${item.id}`} className="card-title">
          {item.title}
        </Link>
        <div className="price">${item.price.toFixed(2)}</div>
        {item.seller === "third_party" && <div className="muted small">Sold by third-party seller</div>}
        <button className="btn" onClick={() => add(item)}>
          Add to cart
        </button>
      </div>
    </article>
  );
}
