import { useNavigate } from 'react-router-dom';
import './HomeScreen.css';

export default function HomeScreen() {
  const navigate = useNavigate();
  return (
    <div className="home-screen">
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
        </div>
      </div>
    </div>
  );
}
