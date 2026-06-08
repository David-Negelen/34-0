import './PokalDrawScreen.css';

export default function PokalDrawScreen({ bracket, onContinue }) {
  if (!bracket || bracket.length < 64) {
    onContinue();
    return null;
  }

  const pairs = [];
  for (let i = 0; i < 64; i += 2) {
    const a = bracket[i];
    const b = bracket[i + 1];
    pairs.push({ a, b, isYou: a?.isPlayer || b?.isPlayer });
  }

  return (
    <div className="draw-screen">
      <header className="draw-header">
        <div className="draw-title">AUSLOSUNG</div>
        <div className="draw-sub">1. RUNDE · DFB-POKAL</div>
      </header>

      <div className="draw-list">
        {pairs.map((pair, i) => (
          <div
            key={i}
            className={`draw-pair${pair.isYou ? ' draw-pair--you' : ''}`}
            style={{ animationDelay: `${Math.min(i, 22) * 55}ms` }}
          >
            <span className="draw-team">{pair.a?.name ?? '?'}</span>
            <span className="draw-vs">vs</span>
            <span className="draw-team draw-team--r">{pair.b?.name ?? '?'}</span>
          </div>
        ))}
      </div>

      <div className="draw-footer">
        <button className="btn btn-primary" onClick={onContinue}>
          Los geht's →
        </button>
      </div>
    </div>
  );
}
