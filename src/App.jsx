import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useGameState } from './hooks/useGameState';
import HomeScreen from './components/HomeScreen';
import SetupScreen from './components/SetupScreen';
import DraftScreen from './components/DraftScreen';
import ResultScreen from './components/ResultScreen';
import PokalResultScreen from './components/PokalResultScreen';
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
  const clubs   = [...BL_CLUBS, ...BL2_CLUBS];

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        onStart={startDraft}
        onBack={() => { reset(); navigate('/'); }}
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
        onGoHome={() => { reset(); navigate('/'); }}
        onReset={reset}
      />
    );
  }

  if (state.phase === 'result') {
    return (
      <PokalResultScreen
        state={state}
        onPlayAgain={reset}
        onHome={() => { reset(); navigate('/'); }}
      />
    );
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
