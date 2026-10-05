import { useExtension, type DisplayMode } from "../app/ExtensionContext";
import type { ClassifierKind } from "../engine";

const MODES: { id: DisplayMode; label: string }[] = [
  { id: "percent", label: "Percent" },
  { id: "dollar", label: "Dollar" },
  { id: "auto", label: "Auto" },
];

export function ExtensionBar() {
  const x = useExtension();
  return (
    <div className="ext-bar" role="toolbar" aria-label="Extension simulator">
      <strong className="ext-title">Extension simulator</strong>
      <button className={`ext-toggle ${x.active ? "on" : ""}`} onClick={x.active ? x.deactivate : x.activate}>
        {x.active ? "Deactivate Cash Back" : "Activate Cash Back"}
      </button>
      <div className="ext-group" aria-label="Display mode">
        {MODES.map((m) => (
          <button key={m.id} className={`seg ${x.mode === m.id ? "sel" : ""}`} onClick={() => x.setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <label className="ext-group">
        Confidence
        <input type="range" min={0} max={1} step={0.05} value={x.threshold} onChange={(e) => x.setThreshold(Number(e.target.value))} />
        <span className="mono">{x.threshold.toFixed(2)}</span>
      </label>
      <label className="ext-group">
        Classifier
        <select value={x.backend} onChange={(e) => x.setBackend(e.target.value as ClassifierKind)}>
          <option value="mock">Mock</option>
          <option value="jev">Jev adapter</option>
        </select>
      </label>
      <label className="ext-group">
        <input type="checkbox" checked={x.debug} onChange={(e) => x.setDebug(e.target.checked)} /> Debug panel
      </label>
    </div>
  );
}
