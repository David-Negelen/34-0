import './PokalDrawScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];

export default function PokalDrawScreen({ matchups, round, onContinue }) {
  if (!matchups?.length) { onContinue(); return null; }

  const sorted = [...matchups].sort((a, b) => {
    if (a.isPlayerMatch) return -1;
    if (b.isPlayerMatch) return 1;
    return 0;
  });

  return (
    <div className="draw-screen">
      <header className="draw-header">
        <div className="draw-title">AUSLOSUNG</div>
        <div className="draw-sub">{ROUND_LABELS[round]} · DFB-POKAL</div>
      </header>

      <div className="draw-list">
        {sorted.map((m, i) => (
          <div
            key={i}
            className={`draw-pair${m.isPlayerMatch ? ' draw-pair--you' : ''}`}
            style={{ animationDelay: `${Math.min(i, 20) * 60}ms` }}
          >
            <span className="draw-team">{m.home}</span>
            <span className="draw-vs">vs</span>
            <span className="draw-team draw-team--r">{m.away}</span>
          </div>
        ))}
      </div>

      <div className="draw-footer">
        <button className="btn btn-primary" onClick={onContinue}>
          Zum Spiel →
        </button>
      </div>
    </div>
  );
}
