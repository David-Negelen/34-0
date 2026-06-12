import { useState } from 'react';
import { labelDE, ratingClass } from '../utils/playerUtils';
import './PokalResultScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];

function scoreLabel(m) {
  const base = `${m.ownGoals}–${m.oppGoals2}`;
  if (m.pens)  return `${base} (${m.penScore} i.E.)`;
  if (m.aet)   return `${base} n.V.`;
  return base;
}

function brakScoreStr(m) {
  const base = `${m.hg}–${m.ag}`;
  if (m.pens) return `${base} n.V. (${m.penScore} i.E.)`;
  if (m.aet)  return `${base} n.V.`;
  return base;
}

function MatchRow({ match, roundIndex }) {
  const ourGoals = (match.events ?? []).filter(e => e.type === 'goal').sort((a, b) => a.minute - b.minute);
  const oppGoals = (match.oppGoals ?? []).sort((a, b) => a.minute - b.minute);

  return (
    <div className={`pk-match pk-match--${match.won ? 'win' : 'loss'}`}>
      <div className="pk-match-top">
        <span className="pk-round-label">{ROUND_LABELS[roundIndex]}</span>
        <span className="pk-opponent">vs {match.opponent}</span>
        <span className={`pk-score pk-score--${match.won ? 'win' : 'loss'}`}>
          {scoreLabel(match)}
          <span className="pk-result-icon">{match.won ? '✓' : '✗'}</span>
        </span>
      </div>
      {ourGoals.length > 0 && (
        <div className="pk-scorers pk-scorers--ours">
          {ourGoals.map((e, i) => (
            <span key={i}>{i > 0 && '  '}{e.scorer.name} {e.minute}'</span>
          ))}
        </div>
      )}
      {oppGoals.length > 0 && (
        <div className="pk-scorers pk-scorers--opp">
          {oppGoals.map((g, i) => (
            <span key={i}>{i > 0 && '  '}{g.scorerName ? `${g.scorerName} ${g.minute}'` : `${g.minute}'`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentBracket({ roundMatchups }) {
  const [openRounds, setOpenRounds] = useState(new Set());

  const toggle = (i) => setOpenRounds(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  if (!roundMatchups?.length) return null;

  return (
    <div className="pk-bracket">
      <div className="pk-bracket-title">Turnierverlauf</div>
      {roundMatchups.map((matchups, roundIdx) => {
        const isOpen = openRounds.has(roundIdx);
        const sorted = [...matchups].sort((a, b) => {
          if (a.isPlayerMatch) return -1;
          if (b.isPlayerMatch) return 1;
          return 0;
        });

        return (
          <div key={roundIdx} className="pk-bracket-round">
            <button className="pk-bracket-toggle" onClick={() => toggle(roundIdx)}>
              <span className="pk-br-label">{ROUND_LABELS[roundIdx]}</span>
              <span className="pk-br-count">{matchups.length} Spiele</span>
              <span className="pk-br-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="pk-bracket-matches">
                {sorted.map((m, i) => (
                  <div key={i} className={`pk-bm${m.isPlayerMatch ? ' pk-bm--player' : ''}`}>
                    <span className={`pk-bm-name pk-bm-home${m.homeWon ? ' pk-bm-winner' : ''}`}>{m.home}</span>
                    <span className="pk-bm-score">{brakScoreStr(m)}</span>
                    <span className={`pk-bm-name pk-bm-away${!m.homeWon ? ' pk-bm-winner' : ''}`}>{m.away}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TeamSection({ slots }) {
  const filled = (slots ?? []).filter(s => s.player);
  if (!filled.length) return null;
  return (
    <div className="pk-team">
      <div className="pk-team-title">Dein Team</div>
      {filled.map(s => {
        const p = s.player;
        const rcls = ratingClass(p.displayRating ?? p.seasonRating, 'pokal');
        return (
          <div key={s.id} className="pk-team-row">
            <span className="pk-team-pos">{labelDE(s.label)}</span>
            <span className="pk-team-name">{p.name}</span>
            <span className="pk-team-sub">{p.spunClub ?? ''}{p.spunSeason ? ` · ${p.spunSeason}` : ''}</span>
            <span className={`pk-team-rating rating ${rcls}`}>{p.displayRating ?? p.seasonRating}</span>
          </div>
        );
      })}
    </div>
  );
}

function achievement(result) {
  const { won, roundReached } = result;
  if (won)               return { label: 'Pokalsieger!',       desc: 'Den DFB-Pokal gewonnen. Eine Legende.' };
  if (roundReached >= 6) return { label: 'Finalist',           desc: 'Das Finale erreicht – knapp am Titel vorbei.' };
  if (roundReached >= 5) return { label: 'Halbfinale',         desc: 'Unter den letzten Vier – eine starke Kampagne.' };
  if (roundReached >= 4) return { label: 'Viertelfinale',      desc: 'Erst im Viertelfinale ausgeschieden.' };
  if (roundReached >= 3) return { label: 'Achtelfinale',       desc: 'Im Achtelfinale gestoppt.' };
  if (roundReached >= 2) return { label: '2. Runde',           desc: 'In der 2. Runde ausgeschieden.' };
  return                        { label: '1. Runde',           desc: 'Gleich in Runde 1 erwischt.' };
}

export default function PokalResultScreen({ state, onPlayAgain, onPlaySameTeam, onHome }) {
  const result = state.result;
  const matches = result.playerMatches ?? [];
  const ach = achievement(result);

  return (
    <div className="pk-screen">
      <header className="pk-header">
        <div className="pk-title">DFB-POKAL</div>
      </header>

      <div className="pk-campaign">
        {matches.map((m, i) => (
          <MatchRow key={i} match={m} roundIndex={i} />
        ))}
      </div>

      <TeamSection slots={result.slots} />

      <div className={`pk-achievement ${result.won ? 'pk-achievement--winner' : ''}`}>
        <div className="pk-ach-label">{result.won ? '🏆 ' : ''}{ach.label}</div>
        <div className="pk-ach-desc">{ach.desc}</div>
      </div>

      <TournamentBracket roundMatchups={result.roundMatchups} />

      <div className="pk-actions">
        {result.slots && onPlaySameTeam && (
          <button className="btn btn-secondary" onClick={onPlaySameTeam} style={{ lineHeight: 1.3 }}>
            Nochmal mit<br />gleichem Team →
          </button>
        )}
        <button className="btn btn-primary" onClick={onPlayAgain}>Nochmal spielen</button>
        <button className="btn btn-ghost" onClick={onHome}>← Menü</button>
      </div>
    </div>
  );
}
