import { useExtension } from "../app/ExtensionContext";
import { useResolverLog, useResolverStats } from "../hooks/useVisibleEvaluation";

export function DebugPanel() {
  const { debug, active, pageItems, resolver } = useExtension();
  const s = useResolverStats();
  const log = useResolverLog();
  if (!debug) return null;
  const onPage = pageItems.length;
  const evaluatedOnPage = pageItems.filter((i) => resolver.has(i)).length;
  const pct = onPage === 0 ? 0 : (evaluatedOnPage / onPage) * 100;
  return (
    <aside className="debug" aria-label="Debug panel">
      <h3>Debug</h3>
      {!active && <p className="muted">Extension is off. Nothing is evaluated.</p>}
      <div className="row">
        <span>Evaluated on this page</span>
        <b className="mono">
          {evaluatedOnPage} / {onPage}
        </b>
      </div>
      <div className="bar" title="Share of products on this page that have been evaluated">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">{onPage - evaluatedOnPage} products are offscreen or not yet seen. They stay unevaluated until scrolled into view.</p>
      <dl>
        <dt>Visible evaluations (session)</dt>
        <dd className="mono">{s.totalVisible}</dd>
        <dt>Resolved by rule</dt>
        <dd className="mono">{s.ruleResolved}</dd>
        <dt>Resolved by classifier</dt>
        <dd className="mono">{s.classifierResolved}</dd>
        <dt>Cache hits</dt>
        <dd className="mono">{s.cacheHits}</dd>
        <dt>Classifier calls made</dt>
        <dd className="mono">{s.classifierCalls}</dd>
        <dt>Classifier calls avoided</dt>
        <dd className="mono big">{s.totalVisible === 0 ? "n/a" : `${s.avoidedPct.toFixed(1)}%`}</dd>
      </dl>
      <p className="muted small">Backend: {resolver.classifierName}</p>
      {resolver.fellBack && <p className="warn">Last classifier call fell back to the mock (no key, proxy unavailable, or API error).</p>}
      {log.length > 0 && (
        <>
          <h4>Latest evaluations</h4>
          <ul className="log">
            {log.slice(0, 6).map((l, i) => (
              <li key={`${l.key}-${i}`}>
                <span className={`tier tier-${l.tier}`}>{l.tier}</span> {l.title}
                <span className="muted small"> {l.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
