import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { findItem } from "../data";
import type { Item, MerchantId } from "../engine";
import { useExtension } from "./ExtensionContext";

export interface CartLine {
  merchant: MerchantId;
  itemId: string;
  quantity: number;
  preActivation: boolean; // added while the extension was off
}

interface CartApi {
  lines: CartLine[];
  add: (item: Item) => void;
  setQty: (merchant: MerchantId, itemId: string, qty: number) => void;
  remove: (merchant: MerchantId, itemId: string) => void;
  forMerchant: (m: MerchantId) => { line: CartLine; item: Item }[];
}

const KEY = "cashback-demo-cart";
const Ctx = createContext<CartApi | null>(null);

function load(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartLine[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { active } = useExtension();
  const [lines, setLines] = useState<CartLine[]>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable, cart stays in memory */
    }
  }, [lines]);

  const add = useCallback(
    (item: Item) =>
      setLines((ls) => {
        const hit = ls.find((l) => l.merchant === item.merchant && l.itemId === item.id);
        if (hit) return ls.map((l) => (l === hit ? { ...l, quantity: l.quantity + 1 } : l));
        return [...ls, { merchant: item.merchant, itemId: item.id, quantity: 1, preActivation: !active }];
      }),
    [active],
  );
  const setQty = useCallback(
    (m: MerchantId, id: string, qty: number) =>
      setLines((ls) => ls.map((l) => (l.merchant === m && l.itemId === id ? { ...l, quantity: Math.max(1, Math.min(99, qty)) } : l))),
    [],
  );
  const remove = useCallback((m: MerchantId, id: string) => setLines((ls) => ls.filter((l) => !(l.merchant === m && l.itemId === id))), []);
  const forMerchant = useCallback(
    (m: MerchantId) =>
      lines
        .filter((l) => l.merchant === m)
        .flatMap((line) => {
          const item = findItem(m, line.itemId);
          return item ? [{ line, item }] : [];
        }),
    [lines],
  );
  return <Ctx.Provider value={{ lines, add, setQty, remove, forMerchant }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CartProvider missing");
  return v;
}
