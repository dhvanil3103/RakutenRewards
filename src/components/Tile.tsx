import type { CSSProperties } from "react";

const initials = (s: string) =>
  s
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export function Tile({ brand, tint, big }: { brand: string; tint: string; big?: boolean }) {
  return (
    <div className={`tile${big ? " tile-big" : ""}`} style={{ "--tint": tint } as CSSProperties} aria-hidden="true">
      <span>{initials(brand)}</span>
    </div>
  );
}
