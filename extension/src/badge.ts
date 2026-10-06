// Badge rendered in a shadow root so Best Buy's CSS cannot affect it, and ours cannot leak out.
import { amountFor, type ItemResult } from "../../src/engine";

const CSS = `
:host { all: initial; }
.b { position: relative; display: inline-flex; align-items: center; gap: 6px; font: 700 12px system-ui, sans-serif; padding: 4px 9px; border-radius: 99px; cursor: help; white-space: nowrap; }
.ok { background: #0b7a3b; color: #fff; }
.ex { background: #8b8b85; color: #fff; }
.chk { background: #fff; color: #444; border: 1.5px dashed #777; }
.load { background: #fff; color: #555; border: 1.5px solid #dcdcd6; cursor: default; }
.dots { display: inline-flex; gap: 3px; } .dots i { width: 5px; height: 5px; border-radius: 50%; background: #888; animation: bl 1s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
@keyframes bl { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.tip { display: none; position: absolute; top: calc(100% + 6px); right: 0; width: 220px; white-space: normal; background: #222; color: #fff; font-weight: 400; padding: 8px 10px; border-radius: 6px; line-height: 1.35; z-index: 10; text-align: left; }
.b:hover .tip { display: block; }
`;
const END = " Estimate. Final determination by merchant.";

export type BadgeState = { kind: "loading" } | { kind: "result"; result: ItemResult; price: number; threshold: number; note?: string };

export function mountBadge(parent: HTMLElement, mode: "absolute" | "inline", tag = "card"): (s: BadgeState) => void {
  const host = document.createElement("div");
  host.setAttribute("data-cashback-badge", tag);
  host.style.cssText = mode === "absolute" ? "position:absolute;top:8px;right:8px;z-index:5;" : "display:inline-block;margin:8px 0;";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const box = document.createElement("div");
  root.append(style, box);
  if (mode === "absolute" && getComputedStyle(parent).position === "static") parent.style.position = "relative";
  parent.appendChild(host);

  const set = (cls: string, label: string, tip: string, dots = false) => {
    box.innerHTML = "";
    const b = document.createElement("span");
    b.className = `b ${cls}`;
    b.tabIndex = 0;
    if (dots) b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    b.append(label);
    if (tip) {
      const t = document.createElement("span");
      t.className = "tip";
      t.setAttribute("role", "tooltip");
      t.textContent = tip + END;
      b.appendChild(t);
    }
    box.appendChild(b);
  };

  return (s) => {
    if (s.kind === "loading") return set("load", "Checking", "", true);
    const r = s.result;
    if (r.status === "unknown") return host.remove();
    const note = s.note ? ` ${s.note}` : "";
    if (r.status === "excluded") return set("ex", "No cash back", r.reason + note);
    const label = `${r.rate}%`;
    if (r.confidence < s.threshold)
      return set("chk", "Check terms", `${r.reason} Confidence ${(r.confidence * 100).toFixed(0)}% is below the ${(s.threshold * 100).toFixed(0)}% threshold (would be ${label} back, about $${amountFor(s.price, 1, r.rate).toFixed(2)}).${note}`);
    set("ok", `${label} back`, r.reason + note);
  };
}
