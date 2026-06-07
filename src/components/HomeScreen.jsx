import './HomeScreen.css';

export default function HomeScreen({ onPickLeague, onLeaderboard }) {
  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-title">
          <span className="title-num">34</span>
          <span className="title-dash">-</span>
          <span className="title-num">0</span>
        </div>
        <p className="home-sub">Draft dein Traumteam. Überleg's dir gut.</p>
      </header>

      <div className="home-leagues">
        <button className="league-card league-card--bl" onClick={() => onPickLeague('bl')}>
          <span className="league-card-name">Bundesliga</span>
          <span className="league-card-sub">1. Bundesliga · 34 Spieltage · 18 Teams</span>
        </button>
        <button className="league-card league-card--2bl" onClick={() => onPickLeague('2bl')}>
          <span className="league-card-name">2. Bundesliga</span>
          <span className="league-card-sub">2. Bundesliga · 34 Spieltage · 18 Teams</span>
        </button>
      </div>

      <button className="home-lb-link" onClick={() => onLeaderboard(null)}>
        Rangliste ansehen
      </button>
    </div>
  );
}
