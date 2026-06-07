import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import HomeScreen from './components/HomeScreen';
import SetupScreen from './components/SetupScreen';
import DraftScreen from './components/DraftScreen';
import ResultScreen from './components/ResultScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import { PLAYERS as BL_PLAYERS, CLUBS as BL_CLUBS } from './data/players';
import { PLAYERS as BL2_PLAYERS, CLUBS as BL2_CLUBS } from './data/players2bl';

export default function App() {
  const [league, setLeague] = useState(null);           // null = home screen
  const [lbLeague, setLbLeague] = useState(null);       // which league's leaderboard to show

  const { state, updateSetup, startDraft, fillSlot, useReroll, setPendingSpin, setResult, reset } =
    useGameState(league ?? 'bl');

  const players = league === '2bl' ? BL2_PLAYERS : BL_PLAYERS;
  const clubs   = league === '2bl' ? BL2_CLUBS   : BL_CLUBS;

  if (lbLeague !== null) {
    return <LeaderboardScreen league={lbLeague} onBack={() => setLbLeague(null)} />;
  }

  if (!league) {
    return (
      <HomeScreen
        onPickLeague={setLeague}
      />
    );
  }

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={() => {
          window.umami?.track('game-started', { formation: state.setup.formation, difficulty: state.setup.difficulty, league });
          startDraft();
        }}
        onLeaderboard={() => setLbLeague(league)}
        onBack={() => { reset(); setLeague(null); }}
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
      />
    );
  }

  if (state.phase === 'result') {
    return (
      <ResultScreen
        state={state}
        league={league}
        onPlayAgain={reset}
        onHome={() => { reset(); setLeague(null); }}
      />
    );
  }

  return null;
}
