import { useGameState } from './hooks/useGameState';
import SetupScreen from './components/SetupScreen';
import DraftScreen from './components/DraftScreen';
import ResultScreen from './components/ResultScreen';

export default function App() {
  const { state, updateSetup, startDraft, fillSlot, useReroll, setResult, reset } = useGameState();

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={startDraft}
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
