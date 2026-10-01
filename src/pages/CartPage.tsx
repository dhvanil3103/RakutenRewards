import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCart } from "../app/CartContext";
import { useExtension } from "../app/ExtensionContext";
import { Badge } from "../components/Badge";
import { tintFor } from "../components/ProductCard";
import { Tile } from "../components/Tile";
import { RULES } from "../data";
import { evaluateCart, type ItemResult, type MerchantId } from "../engine";
import { useResolverStats } from "../hooks/useVisibleEvaluation";

const PENDING: ItemResult = { status: "unknown", rate: 0, amount: 0, confidence: 0, tier: "default", reason: "Evaluating..." };
const money = (n: number) => `$${n.toFixed(2)}`;

export default function CartPage() {
  const merchant = useParams().storeId as MerchantId;
  const rules = RULES[merchant];
  const { forMerchant, setQty, remove } = useCart();
  const { active, resolver, setPageItems } = useExtension();
  useResolverStats(); // re-render when evaluations land
  const [starDollars, setStarDollars] = useState(0);
  const [nonUS, setNonUS] = useState(false);
  const [returnSim, setReturnSim] = useState(false);

  const entries = useMemo(() => forMerchant(merchant), [forMerchant, merchant]);
  useEffect(() => {
    setPageItems(entries.map((e) => e.item));
    if (active) entries.forEach((e) => resolver.request(e.item)); // cart lines are always on screen
  }, [entries, active, resolver, setPageItems]);

  const summary = useMemo(
    () =>
      evaluateCart(
        entries.map((e) => ({ item: e.item, quantity: e.line.quantity, result: resolver.get(e.item) ?? PENDING })),
        rules,
        { starDollars, nonUS, returnSimulated: returnSim },
      ),
    // resolver stats change whenever a result lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, rules, starDollars, nonUS, returnSim, resolver, resolver.getStats()],
  );

  if (entries.length === 0) {
    return (
      <div>
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty. <Link to={`/${merchant}`}>Keep shopping</Link></p>
      </div>
    );
  }

  return (
    <div className="cart">
      <div>
        <h1>Your cart</h1>
        {summary.lines.map((l, i) => {
          const { line } = entries[i];
          return (
            <div className="cart-line" key={l.item.id}>
              <Tile brand={l.item.brand} tint={tintFor(l.item.brand)} />
              <div className="cart-info">
                <Link to={`/${merchant}/p/${l.item.id}`} className="card-title">{l.item.title}</Link>
                <div className="muted small">{l.item.brand} · ${l.item.price.toFixed(2)} each</div>
                <div className="qty">
                  <button onClick={() => setQty(merchant, l.item.id, line.quantity - 1)} aria-label="Decrease quantity">-</button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={line.quantity}
                    onChange={(e) => setQty(merchant, l.item.id, Number(e.target.value) || 1)}
                    aria-label="Quantity"
                  />
                  <button onClick={() => setQty(merchant, l.item.id, line.quantity + 1)} aria-label="Increase quantity">+</button>
                  <button className="link" onClick={() => remove(merchant, l.item.id)}>Remove</button>
                </div>
              </div>
              <div className="cart-money">
                <div className="price">{money(l.lineTotal)}</div>
                {active && (
                  <>
                    <Badge result={l.result} price={l.item.price} quantity={l.quantity} where="cart" />
                    {l.result.status === "eligible" && <div className="small">Cash back {money(l.cashBack)}</div>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="summary">
        <h2>Order summary</h2>
        <div className="row"><span>Subtotal</span><span>{money(summary.subtotal)}</span></div>
        <div className="row"><span>Tax (mock 8%, not eligible)</span><span>{money(summary.tax)}</span></div>
        <div className="row"><span>Shipping (mock)</span><span>{summary.shipping === 0 ? "Free" : money(summary.shipping)}</span></div>
        <div className="row total"><span>Order total</span><span>{money(summary.orderTotal)}</span></div>

        {merchant === "macys" && (
          <label className="field">
            Pay part with Star Dollars: $
            <input type="number" min={0} step="0.01" value={starDollars} onChange={(e) => setStarDollars(Math.max(0, Number(e.target.value) || 0))} /> (mock)
          </label>
        )}
        {merchant === "nike" && (
          <>
            <label className="field"><input type="checkbox" checked={nonUS} onChange={(e) => setNonUS(e.target.checked)} /> Ship to a non-US address</label>
            <label className="field"><input type="checkbox" checked={returnSim} onChange={(e) => setReturnSim(e.target.checked)} /> Simulate a return, exchange or cancellation on any part of the order</label>
          </>
        )}

        {active ? (
          <>
            <div className="cb-total">
              Estimated cash back {money(summary.cashBack)} <span>({summary.pctOfSubtotal.toFixed(1)}% of subtotal)</span>
            </div>
            {summary.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
            {summary.infos.map((w) => <p key={w} className="muted small">{w}</p>)}
            {summary.notEarning.length > 0 && (
              <div className="not-earning">
                <h3>Not earning cash back</h3>
                <ul>
                  {summary.notEarning.map((n) => (
                    <li key={n.itemId}><b>{n.title}</b><br /><span className="muted small">{n.reason}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <p className="muted small">Estimate. Final determination by merchant. Based on item price, excluding tax and shipping.</p>
          </>
        ) : (
          <p className="muted">Activate Cash Back in the bar above to see an estimate.</p>
        )}
      </aside>
    </div>
  );
}
