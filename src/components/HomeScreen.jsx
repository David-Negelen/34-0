import { useNavigate } from 'react-router-dom';
import './HomeScreen.css';

export default function HomeScreen() {
  const navigate = useNavigate();
  return (
    <div className="home-screen">
      <div className="home-body">
      <header className="home-header">
        <div className="home-title">
          <span className="title-num">34</span>
          <span className="title-dash">-</span>
          <span className="title-num">0</span>
        </div>
      </header>

      <div className="home-leagues">
        <div className="league-group">
          <button className="league-card league-card--bl" onClick={() => navigate('/bl')}>
            <span className="league-card-name">Bundesliga</span>
            <span className="league-card-sub">1. Bundesliga · 34 Spieltage · 18 Teams</span>
          </button>
          <button className="league-lb-link" onClick={() => navigate('/leaderboard/bl')}>
            Rangliste ansehen →
          </button>
        </div>
        <div className="league-group">
          <button className="league-card league-card--2bl" onClick={() => navigate('/2bl')}>
            <span className="league-card-name">2. Bundesliga</span>
            <span className="league-card-sub">2. Bundesliga · 34 Spieltage · 18 Teams</span>
          </button>
          <button className="league-lb-link" onClick={() => navigate('/leaderboard/2bl')}>
            Rangliste ansehen →
          </button>
        </div>
        <div className="league-group">
          <button className="league-card league-card--pokal" onClick={() => navigate('/pokal')}>
            <span className="league-card-name">DFB-Pokal</span>
            <span className="league-card-sub">Pokal · 6 Runden · K.o.-System</span>
          </button>
          <button className="league-lb-link" onClick={() => navigate('/pokal-stats')}>
            Statistiken ansehen →
          </button>
        </div>
        <div className="league-group">
          <button className="league-card league-card--karriere" onClick={() => navigate('/karriere')}>
            <span className="league-card-name">Karriere</span>
            <span className="league-card-sub">Start in der 2. Liga · Aufstieg möglich</span>
          </button>
        </div>
      </div>
      </div>

      <footer className="home-footer">
        <a href="/datenschutz.html" className="home-footer-link">Datenschutz</a>
      </footer>
    </div>
  );
}
