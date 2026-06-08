import './PokalRoundResultsScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];

function scoreStr(m) {
  const base = `${m.hg}–${m.ag}`;
  if (m.pens) return `${base} n.V. (${m.penScore} i.E.)`;
  if (m.aet)  return `${base} n.V.`;
  return base;
}

export default function PokalRoundResultsScreen({ matchups, round, playerWon, onContinue }) {
  const isFinal = round === 5;

  const sorted = [...matchups].sort((a, b) => {
    if (a.isPlayerMatch) return -1;
    if (b.isPlayerMatch) return 1;
    return 0;
  });

  const btnLabel = isFinal
    ? 'Zusammenfassung'
    : playerWon
    ? 'Nächste Runde →'
    : 'Zum Ergebnis';

  return (
    <div className="prr-screen">
      <header className="prr-header">
        <div className="prr-round">{ROUND_LABELS[round]}</div>
        <div className="prr-sub">ERGEBNISSE</div>
      </header>

      <div className="prr-list">
        {sorted.map((m, i) => (
          <div key={i} className={`prr-row${m.isPlayerMatch ? ' prr-row--player' : ''}`}>
            <span className={`prr-team prr-home${m.homeWon ? ' prr-winner' : ''}`}>{m.home}</span>
            <span className="prr-score">{scoreStr(m)}</span>
            <span className={`prr-team prr-away${!m.homeWon ? ' prr-winner' : ''}`}>{m.away}</span>
          </div>
        ))}
      </div>

      <div className="prr-actions">
        <button className="btn btn-primary" onClick={onContinue}>{btnLabel}</button>
      </div>
    </div>
  );
}
