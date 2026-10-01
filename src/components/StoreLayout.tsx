import { useEffect, type CSSProperties } from "react";
import { Link, Navigate, Outlet, useParams } from "react-router-dom";
import { useCart } from "../app/CartContext";
import { useExtension } from "../app/ExtensionContext";
import { STORES } from "../data";
import { DebugPanel } from "./DebugPanel";
import { ExtensionBar } from "./ExtensionBar";

export function StoreLayout() {
  const { storeId } = useParams();
  const store = STORES.find((s) => s.id === storeId);
  const { lines } = useCart();
  const { active, debug, setPageItems } = useExtension();
  useEffect(() => () => setPageItems([]), [storeId, setPageItems]);
  if (!store) return <Navigate to="/" replace />;

  const count = lines.filter((l) => l.merchant === store.id).reduce((n, l) => n + l.quantity, 0);
  const preActivation = active && lines.some((l) => l.merchant === store.id && l.preActivation);
  return (
    <div className={`store${debug ? " has-debug" : ""}`} style={{ "--brand": store.color, "--ink": store.ink } as CSSProperties}>
      <ExtensionBar />
      <header className="store-head">
        <Link to="/" className="back">
          All stores
        </Link>
        <Link to={`/${store.id}`} className="wordmark">
          {store.wordmark}
        </Link>
        <nav>
          <Link to={`/${store.id}`}>Shop</Link>
          <Link to={`/${store.id}/cart`}>Cart ({count})</Link>
        </nav>
      </header>
      {preActivation && <div className="notice">Items added before activation may not earn cash back.</div>}
      <main className="store-main">
        <Outlet />
      </main>
      <DebugPanel />
    </div>
  );
}
