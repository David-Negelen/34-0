import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useGameState } from './hooks/useGameState';
import HomeScreen from './components/HomeScreen';
import SetupScreen from './components/SetupScreen';
import DraftScreen from './components/DraftScreen';
import ResultScreen from './components/ResultScreen';
import PokalResultScreen from './components/PokalResultScreen';
import PokalDrawScreen from './components/PokalDrawScreen';
import PokalMatchScreen from './components/PokalMatchScreen';
import PokalRoundResultsScreen from './components/PokalRoundResultsScreen';
import { buildPokalField, drawPokalRound } from './utils/simulation';
import LeaderboardScreen from './components/LeaderboardScreen';
import { PLAYERS as BL_PLAYERS, CLUBS as BL_CLUBS } from './data/players';
import { PLAYERS as BL2_PLAYERS, CLUBS as BL2_CLUBS } from './data/players2bl';

function LeagueGame() {
  const { league } = useParams();
  const navigate = useNavigate();
  const { state, updateSetup, startDraft, fillSlot, useReroll, setPendingSpin, setResult, reset } =
    useGameState(league);

  if (league !== 'bl' && league !== '2bl') return <Navigate to="/" replace />;

  const players = league === '2bl' ? BL2_PLAYERS : BL_PLAYERS;
  const clubs   = league === '2bl' ? BL2_CLUBS   : BL_CLUBS;

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={() => {
          window.umami?.track('game-started', { formation: state.setup.formation, difficulty: state.setup.difficulty, league });
          startDraft();
        }}
        onLeaderboard={() => navigate(`/leaderboard/${league}`)}
        onBack={() => { reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'draft') {
    return (
      <DraftScreen
        state={state}
        league={league}
        players={players}
        clubs={clubs}
        fillSlot={fillSlot}
        useReroll={useReroll}
        setPendingSpin={setPendingSpin}
        setResult={setResult}
        onGoHome={() => { reset(); navigate('/'); }}
        onReset={reset}
      />
    );
  }

  if (state.phase === 'result') {
    return (
      <ResultScreen
        state={state}
        league={league}
        onPlayAgain={reset}
        onHome={() => { reset(); navigate('/'); }}
      />
    );
  }

  return null;
}

function PokalGame() {
  const navigate = useNavigate();
  const { state, updateSetup, startDraft, fillSlot, useReroll, setPendingSpin, setResult, reset } =
    useGameState('pokal');

  const players = [...BL_PLAYERS, ...BL2_PLAYERS];
  const clubs   = { ...BL_CLUBS, ...BL2_CLUBS };

  // pk drives the round-by-round tournament: draw → match → round-results, repeated per round.
  // null while in setup/draft phase.
  const [pk, setPk] = useState(null);

  // Init or restore tournament state when phase becomes 'result'.
  useEffect(() => {
    if (state.phase !== 'result' || state.result?.mode !== 'pokal' || pk !== null) return;
    if (state.result.playerMatches) {
      // Tournament already finished (reloaded from localStorage)
      setPk({ phase: 'summary' });
      return;
    }
    if (!state.result.slots) return;
    const teams = buildPokalField(state.result.slots, players);
    const { matchups, winners } = drawPokalRound(teams, 0, state.result.slots);
    setPk({ phase: 'draw', round: 0, teams, matchups, winners, slots: state.result.slots, playerMatches: [] });
  }, [state.phase, state.result]);

  useEffect(() => {
    if (state.phase === 'setup') setPk(null);
  }, [state.phase]);

  function handleReset() {
    reset();
    setPk(null);
  }

  // Player finished watching their match — store it, show round results.
  function handleMatchDone() {
    const pm = pk.matchups.find(m => m.isPlayerMatch)?.playerMatch;
    if (!pm) return;
    setPk(prev => ({ ...prev, phase: 'round-results', playerMatches: [...prev.playerMatches, pm] }));
  }

  // After seeing round results: advance to next round draw or finish.
  function handleRoundContinue() {
    const last = pk.playerMatches[pk.playerMatches.length - 1];
    const playerWon = last?.won ?? false;
    const isFinal   = pk.round === 5;

    if (!playerWon || isFinal) {
      setResult({
        mode: 'pokal',
        playerMatches: pk.playerMatches,
        roundReached: pk.playerMatches.length,
        won: isFinal && playerWon,
      });
      setPk(prev => ({ ...prev, phase: 'summary' }));
      return;
    }

    const nextRound = pk.round + 1;
    const { matchups, winners } = drawPokalRound(pk.winners, nextRound, pk.slots);
    setPk(prev => ({ ...prev, phase: 'draw', round: nextRound, teams: pk.winners, matchups, winners }));
  }

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={startDraft}
        onBack={() => { handleReset(); navigate('/'); }}
        titleLeft="6"
        titleRight="0"
        subtitle="Gewinne den DFB-Pokal"
      />
    );
  }

  if (state.phase === 'draft') {
    return (
      <DraftScreen
        state={state}
        league="pokal"
        players={players}
        clubs={clubs}
        fillSlot={fillSlot}
        useReroll={useReroll}
        setPendingSpin={setPendingSpin}
        setResult={setResult}
        onGoHome={() => { handleReset(); navigate('/'); }}
        onReset={handleReset}
      />
    );
  }

  if (state.phase === 'result' && pk) {
    if (pk.phase === 'draw') {
      return (
        <PokalDrawScreen
          matchups={pk.matchups}
          round={pk.round}
          onContinue={() => setPk(p => ({ ...p, phase: 'match' }))}
        />
      );
    }
    if (pk.phase === 'match') {
      const matchup = pk.matchups.find(m => m.isPlayerMatch);
      return (
        <PokalMatchScreen
          key={pk.round}
          match={matchup.playerMatch}
          roundIndex={pk.round}
          onContinue={handleMatchDone}
        />
      );
    }
    if (pk.phase === 'round-results') {
      const last = pk.playerMatches[pk.playerMatches.length - 1];
      return (
        <PokalRoundResultsScreen
          matchups={pk.matchups}
          round={pk.round}
          playerWon={last?.won ?? false}
          onContinue={handleRoundContinue}
        />
      );
    }
    if (pk.phase === 'summary') {
      return (
        <PokalResultScreen
          state={state}
          onPlayAgain={handleReset}
          onHome={() => { handleReset(); navigate('/'); }}
        />
      );
    }
  }

  return null;
}

function LeaderboardPage() {
  const { league } = useParams();
  const navigate = useNavigate();
  return <LeaderboardScreen league={league} onBack={() => navigate(-1)} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/pokal" element={<PokalGame />} />
      <Route path="/:league" element={<LeagueGame />} />
      <Route path="/leaderboard/:league" element={<LeaderboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
