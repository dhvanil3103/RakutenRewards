import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { RULES } from "../data";
import { createClassifier, Resolver, type ClassifierKind, type Item } from "../engine";

export type DisplayMode = "percent" | "dollar" | "auto";

interface Ext {
  active: boolean;
  activate: () => void;
  deactivate: () => void;
  mode: DisplayMode;
  setMode: (m: DisplayMode) => void;
  threshold: number;
  setThreshold: (n: number) => void;
  backend: ClassifierKind;
  setBackend: (k: ClassifierKind) => void;
  debug: boolean;
  setDebug: (b: boolean) => void;
  resolver: Resolver;
  pageItems: Item[];
  setPageItems: (items: Item[]) => void;
}

const Ctx = createContext<Ext | null>(null);

export function ExtensionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [session, setSession] = useState(0);
  const [mode, setMode] = useState<DisplayMode>("auto");
  const [threshold, setThreshold] = useState(0.7);
  const [backend, setBackend] = useState<ClassifierKind>("mock");
  const [debug, setDebug] = useState(true);
  const [pageItems, setPageItems] = useState<Item[]>([]);

  // A fresh resolver per activation or backend change: counters and the cache start clean.
  const resolver = useMemo(
    () => new Resolver(RULES, createClassifier(backend, { jevApiKey: import.meta.env.VITE_JEV_API_KEY as string | undefined })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend, session],
  );
  const activate = useCallback(() => {
    setSession((s) => s + 1);
    setActive(true);
  }, []);
  const deactivate = useCallback(() => setActive(false), []);

  const value: Ext = { active, activate, deactivate, mode, setMode, threshold, setThreshold, backend, setBackend, debug, setDebug, resolver, pageItems, setPageItems };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExtension() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ExtensionProvider missing");
  return v;
}
