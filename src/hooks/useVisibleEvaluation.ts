import { useEffect, useRef, useSyncExternalStore } from "react";
import { useExtension } from "../app/ExtensionContext";
import type { Item } from "../engine";

/**
 * Evaluates the item the first time its element is at least half visible
 * (100px margin), never before and never twice: the resolver memoizes by product.
 */
export function useVisibleEvaluation<T extends HTMLElement>(item: Item) {
  const { active, resolver } = useExtension();
  const ref = useRef<T | null>(null);
  const result = useSyncExternalStore(resolver.subscribe, () => resolver.get(item));
  const pending = useSyncExternalStore(resolver.subscribe, () => resolver.has(item) && !resolver.get(item));

  useEffect(() => {
    const el = ref.current;
    if (!active || !el || resolver.has(item)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          resolver.request(item);
          io.disconnect();
        }
      },
      { threshold: 0.5, rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, resolver, item]);

  return { ref, result: active ? result : undefined, pending: active && pending, evaluated: result !== undefined };
}

export function useResolverStats() {
  const { resolver } = useExtension();
  return useSyncExternalStore(resolver.subscribe, resolver.getStats);
}

export function useResolverLog() {
  const { resolver } = useExtension();
  return useSyncExternalStore(resolver.subscribe, resolver.getLog);
}
