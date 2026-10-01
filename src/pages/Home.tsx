import { Link } from "react-router-dom";
import { STORES } from "../data";

export default function Home() {
  return (
    <main className="home">
      <h1>Cash back overlay demo</h1>
      <p className="lead">
        Pick a mock store, activate the simulated extension, and scroll. Cash back is read from each merchant's Terms &amp; Conditions as rules, not a model call per product.
      </p>
      <div className="home-grid">
        {STORES.map((s) => (
          <Link key={s.id} to={`/${s.id}`} className="home-card" style={{ background: s.color, color: s.ink }}>
            <span className="home-name">{s.wordmark}</span>
            <span>{s.tagline}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
