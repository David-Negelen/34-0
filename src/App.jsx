import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import SetupScreen from './components/SetupScreen';
import DraftScreen from './components/DraftScreen';
import ResultScreen from './components/ResultScreen';
import LeaderboardScreen from './components/LeaderboardScreen';

export default function App() {
  const { state, updateSetup, startDraft, fillSlot, useReroll, setResult, reset } = useGameState();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  if (showLeaderboard) {
    return <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />;
  }

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={() => {
          window.umami?.track('game-started', { formation: state.setup.formation, difficulty: state.setup.difficulty });
          startDraft();
        }}
        onLeaderboard={() => setShowLeaderboard(true)}
      />
    );
  }

  if (state.phase === 'draft') {
    return (
      <DraftScreen
        state={state}
        fillSlot={fillSlot}
        useReroll={useReroll}
        setResult={setResult}
      />
    );
  }

  if (state.phase === 'result') {
    return (
      <ResultScreen
        state={state}
        onPlayAgain={reset}
      />
    );
  }

  return null;
}
