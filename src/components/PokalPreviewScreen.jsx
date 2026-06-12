import './PokalPreviewScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];

const TIER_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga', lower: 'Amateure/Regional' };

export default function PokalPreviewScreen({ matchup, round, onStart }) {
  const pm = matchup.playerMatch;
  const playerTeam = pm.home ? matchup.homeTeam : matchup.awayTeam;
  const oppTeam    = pm.home ? matchup.awayTeam : matchup.homeTeam;

  const playerStr = Math.round((playerTeam.att + playerTeam.def) / 2);
  const oppStr    = Math.round((oppTeam.att + oppTeam.def) / 2);
  const total     = playerStr + oppStr;
  const playerPct = Math.round((playerStr / total) * 100);
  const oppPct    = 100 - playerPct;

  const diff = playerStr - oppStr;
  const label = diff >= 8 ? 'Klarer Favorit' : diff >= 3 ? 'Leichter Favorit' : diff >= -2 ? 'Ausgeglichenes Duell' : diff >= -7 ? 'Leichter Außenseiter' : 'Klarer Außenseiter';

  return (
    <div className="prev-screen">
      <header className="prev-header">
        <div className="prev-round">{ROUND_LABELS[round]}</div>
        <div className="prev-sub">DFB-POKAL · PROGNOSE</div>
      </header>

      <div className="prev-card">
        <div className="prev-matchup">
          <div className="prev-team prev-team--mine">
            <span className="prev-team-name">Deine 11</span>
            <span className="prev-venue-badge">{pm.home ? 'Heim' : 'Auswärts'}</span>
          </div>
          <span className="prev-vs">vs</span>
          <div className="prev-team prev-team--opp">
            <span className="prev-team-name">{pm.opponent}</span>
            {oppTeam.tier && <span className="prev-tier-badge">{TIER_LABEL[oppTeam.tier] ?? ''}</span>}
          </div>
        </div>

        <div className="prev-bar-section">
          <div className="prev-bar-track">
            <div className="prev-bar-fill prev-bar-fill--mine" style={{ width: `${playerPct}%` }} />
            <div className="prev-bar-fill prev-bar-fill--opp"  style={{ width: `${oppPct}%` }} />
          </div>
          <div className="prev-bar-labels">
            <span className="prev-pct prev-pct--mine">{playerPct}%</span>
            <span className="prev-label">{label}</span>
            <span className="prev-pct prev-pct--opp">{oppPct}%</span>
          </div>
        </div>

        <div className="prev-ratings">
          <div className="prev-rating-row">
            <span className="prev-rating-val">{playerStr}</span>
            <span className="prev-rating-lbl">Stärke</span>
            <span className="prev-rating-val prev-rating-val--opp">{oppStr}</span>
          </div>
        </div>
      </div>

      <div className="prev-footer">
        <button className="btn btn-primary prev-start-btn" onClick={onStart}>
          Spiel simulieren →
        </button>
      </div>
    </div>
  );
}
