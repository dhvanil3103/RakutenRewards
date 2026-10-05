import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useCart } from "../app/CartContext";
import { useExtension } from "../app/ExtensionContext";
import { Badge } from "../components/Badge";
import { tintFor } from "../components/ProductCard";
import { Tile } from "../components/Tile";
import { findItem } from "../data";
import type { MerchantId } from "../engine";
import { useVisibleEvaluation } from "../hooks/useVisibleEvaluation";

export default function ProductPage() {
  const { storeId, productId } = useParams();
  const item = findItem(storeId as MerchantId, productId ?? "");
  const { add } = useCart();
  const { setPageItems, debug } = useExtension();
  useEffect(() => setPageItems(item ? [item] : []), [item, setPageItems]);
  if (!item) return <p>Product not found. <Link to={`/${storeId}`}>Back to the store</Link></p>;
  return <Detail key={item.id} item={item} add={() => add(item)} debug={debug} />;
}

function Detail({ item, add, debug }: { item: NonNullable<ReturnType<typeof findItem>>; add: () => void; debug: boolean }) {
  const { ref, result, pending } = useVisibleEvaluation<HTMLDivElement>(item);
  return (
    <div className="detail">
      <div className="detail-media" ref={ref}>
        <Tile brand={item.brand} tint={tintFor(item.brand)} big />
        <div className="badge-slot">
          <Badge result={result} pending={pending} price={item.price} where="detail" />
        </div>
      </div>
      <div>
        <p className="crumbs muted">{item.breadcrumb.length ? item.breadcrumb.join(" > ") : "No category"}</p>
        <h1>{item.title}</h1>
        <p className="muted">{item.brand}</p>
        <p className="price big">${item.price.toFixed(2)}</p>
        <p className="muted">{item.seller === "third_party" ? "Sold by a third-party seller" : "Sold and shipped by the store"}</p>
        <button className="btn btn-primary" onClick={add}>
          Add to cart
        </button>
        {debug && result && (
          <p className="muted small">
            {result.tier} tier, confidence {(result.confidence * 100).toFixed(0)}%. {result.reason}
          </p>
        )}
        <p><Link to={`/${item.merchant}`}>Back to the store</Link></p>
      </div>
    </div>
  );
}
