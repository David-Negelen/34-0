import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import './SetupScreen.css';

const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   sub: '3 rerolls' },
  { key: 'normal', label: 'Normal', sub: '1 reroll'  },
  { key: 'hard',   label: 'Hard',   sub: 'No rerolls · Blind ratings' },
];

export default function SetupScreen({ setup, onUpdate, onStart }) {
  const { formation, difficulty, showRatings, draftMode, ratingMode } = setup;

  return (
    <div className="setup-screen">
      <header className="setup-header">
        <div className="setup-logo">
          <span className="logo-bl">BUNDESLIGA</span>
          <span className="logo-sub">DREAM XI</span>
        </div>
        <p className="setup-tagline">Draft your all-time XI from a club-season spin</p>
      </header>

      <div className="setup-body">

        {/* Formation */}
        <section className="setup-section">
          <h3 className="setup-label">Formation</h3>
          <div className="formation-grid">
            {FORMATION_KEYS.map(key => {
              const f = FORMATIONS[key];
              return (
                <button
                  key={key}
                  className={`formation-card ${formation === key ? 'selected' : ''}`}
                  onClick={() => onUpdate({ formation: key })}
                >
                  <PitchMini slots={f.slots} />
                  <span className="formation-name">{f.name}</span>
                  <span className="formation-desc">{f.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="setup-options-row">

          {/* Difficulty */}
          <section className="setup-section flex-1">
            <h3 className="setup-label">Difficulty</h3>
            <div className="difficulty-group">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.key}
                  className={`difficulty-btn ${difficulty === d.key ? 'selected' : ''}`}
                  onClick={() => onUpdate({ difficulty: d.key, showRatings: d.key !== 'hard' })}
                >
                  <span className="diff-label">{d.label}</span>
                  <span className="diff-sub">{d.sub}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="options-column">

            {/* Show Ratings */}
            <section className="setup-section">
              <h3 className="setup-label">Ratings</h3>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${showRatings ? 'active' : ''}`}
                  onClick={() => onUpdate({ showRatings: true })}
                  disabled={difficulty === 'hard'}
                >
                  Visible
                </button>
                <button
                  className={`toggle-btn ${!showRatings ? 'active' : ''}`}
                  onClick={() => onUpdate({ showRatings: false })}
                >
                  Blind
                </button>
              </div>
            </section>

            {/* Draft Mode */}
            <section className="setup-section">
              <h3 className="setup-label">Draft Mode</h3>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${draftMode === 'squad-first' ? 'active' : ''}`}
                  onClick={() => onUpdate({ draftMode: 'squad-first' })}
                >
                  Squad First
                </button>
                <button
                  className={`toggle-btn ${draftMode === 'position-first' ? 'active' : ''}`}
                  onClick={() => onUpdate({ draftMode: 'position-first' })}
                >
                  Pos. First
                </button>
              </div>
            </section>

            {/* Rating Mode */}
            <section className="setup-section">
              <h3 className="setup-label">Player Ratings</h3>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${ratingMode === 'career' ? 'active' : ''}`}
                  onClick={() => onUpdate({ ratingMode: 'career' })}
                >
                  Career Season
                </button>
                <button
                  className={`toggle-btn ${ratingMode === 'prime' ? 'active' : ''}`}
                  onClick={() => onUpdate({ ratingMode: 'prime' })}
                >
                  Prime
                </button>
              </div>
            </section>

          </div>
        </div>

        <button className="btn btn-primary btn-lg start-btn" onClick={onStart}>
          Start Draft
        </button>
      </div>
    </div>
  );
}

// Tiny pitch miniature showing slot dots
function PitchMini({ slots }) {
  return (
    <div className="pitch-mini">
      {slots.map(s => (
        <span
          key={s.id}
          className="pitch-dot"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        />
      ))}
    </div>
  );
}
