import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import './SetupScreen.css';

const DIFFICULTIES = [
  { key: 'easy',   label: 'Leicht', sub: '3 Joker verfügbar' },
  { key: 'normal', label: 'Normal', sub: '1 Joker verfügbar'  },
  { key: 'hard',   label: 'Schwer', sub: 'Kein Joker · Bewertungen verborgen' },
];

export default function SetupScreen({ setup, onUpdate, onStart }) {
  const { formation, difficulty, showRatings, draftMode, ratingMode } = setup;

  return (
    <div className="setup-screen">
      <header className="setup-header">
        <div className="setup-title">
          <span className="title-num">34</span>
          <span className="title-dash">-</span>
          <span className="title-num">0</span>
        </div>
      </header>

      <div className="setup-body">

        {/* Formation */}
        <section className="setup-section">
          <h3 className="setup-label">Formation</h3>
          <div className="formation-btns">
            {FORMATION_KEYS.map(key => (
              <button
                key={key}
                className={`formation-btn ${formation === key ? 'selected' : ''}`}
                onClick={() => onUpdate({ formation: key })}
              >
                {key}
              </button>
            ))}
          </div>
          <PitchMini slots={FORMATIONS[formation].slots} />
          <p className="formation-desc">{FORMATIONS[formation].description}</p>
        </section>

        {/* Difficulty */}
        <section className="setup-section">
          <h3 className="setup-label">Schwierigkeitsgrad</h3>
          <div className="diff-cards">
            {DIFFICULTIES.map(d => (
              <button
                key={d.key}
                className={`diff-card ${difficulty === d.key ? 'selected' : ''}`}
                onClick={() => onUpdate({ difficulty: d.key, showRatings: d.key !== 'hard' })}
              >
                <span className="diff-name">{d.label}</span>
                <span className="diff-sub">{d.sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Show Ratings */}
        <section className="setup-section">
          <h3 className="setup-label">Bewertungen anzeigen</h3>
          <div className="opt-cards">
            <button
              className={`opt-card ${showRatings ? 'selected' : ''}`}
              onClick={() => onUpdate({ showRatings: true })}
              disabled={difficulty === 'hard'}
            >
              <span className="opt-name">An</span>
              <span className="opt-sub">Spielerstärken sichtbar</span>
            </button>
            <button
              className={`opt-card ${!showRatings ? 'selected' : ''}`}
              onClick={() => onUpdate({ showRatings: false })}
            >
              <span className="opt-name">Aus</span>
              <span className="opt-sub">Blindmodus – vertrau deinem Bauch</span>
            </button>
          </div>
        </section>

        {/* Draft Mode */}
        <section className="setup-section">
          <h3 className="setup-label">Draft-Modus</h3>
          <div className="opt-cards">
            <button
              className={`opt-card ${draftMode === 'squad-first' ? 'selected' : ''}`}
              onClick={() => onUpdate({ draftMode: 'squad-first' })}
            >
              <span className="opt-name">Kader zuerst</span>
              <span className="opt-sub">Klub drehen, Spieler wählen, Position bestimmen</span>
            </button>
            <button
              className={`opt-card ${draftMode === 'position-first' ? 'selected' : ''}`}
              onClick={() => onUpdate({ draftMode: 'position-first' })}
            >
              <span className="opt-name">Position zuerst</span>
              <span className="opt-sub">Position wählen, dann Klub drehen</span>
            </button>
          </div>
        </section>

        {/* Rating Mode */}
        <section className="setup-section">
          <h3 className="setup-label">Spielerbewertungen</h3>
          <div className="opt-cards">
            <button
              className={`opt-card ${ratingMode === 'career' ? 'selected' : ''}`}
              onClick={() => onUpdate({ ratingMode: 'career' })}
            >
              <span className="opt-name">Saisonstärke</span>
              <span className="opt-sub">Spieler bewertet wie in der jeweiligen Saison</span>
            </button>
            <button
              className={`opt-card ${ratingMode === 'prime' ? 'selected' : ''}`}
              onClick={() => onUpdate({ ratingMode: 'prime' })}
            >
              <span className="opt-name">Prime</span>
              <span className="opt-sub">Jeder Spieler in seiner Prime</span>
            </button>
          </div>
        </section>

        <button className="start-btn" onClick={onStart}>
          Draft starten →
        </button>

        <footer className="setup-footer">
          <span>Inspiriert von 38-0.app/game</span>
        </footer>
      </div>
    </div>
  );
}

function PitchMini({ slots }) {
  return (
    <div className="pitch-mini">
      {/* pitch markings */}
      <div className="pm-center-line" />
      <div className="pm-center-circle" />
      <div className="pm-box pm-box-top" />
      <div className="pm-box pm-box-bottom" />
      {slots.map(s => (
        <span
          key={s.id}
          className="pm-dot"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
