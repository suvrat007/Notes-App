import { useEffect, useState } from 'react';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import VoiceModal from './components/VoiceModal';
import Toaster from './components/Toaster';
import type { ScreenKey } from './screens/registry';
import HomeScreen from './screens/HomeScreen';
import RoadmapScreen from './screens/RoadmapScreen';
import StatsScreen from './screens/StatsScreen';
import ProfileScreen from './screens/ProfileScreen';
import { useForge } from './store/useForge';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState<ScreenKey>('home');
  const [voice, setVoice] = useState(false);
  const loadToday = useForge((s) => s.loadToday);

  // The sidebar reads store state, so the store must be warm before any
  // screen mounts — otherwise the rail flashes empty on a desktop load.
  useEffect(() => { void loadToday(); }, [loadToday]);

  return (
    <div className="app">
      <Sidebar active={screen} onChange={setScreen} onVoice={() => setVoice(true)} />

      <main className="app__body">
        {screen === 'home' && <HomeScreen />}
        {screen === 'roadmap' && <RoadmapScreen />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'profile' && <ProfileScreen />}
      </main>

      <TabBar active={screen} onChange={setScreen} />

      {voice && <VoiceModal onClose={() => setVoice(false)} />}

      <Toaster />
    </div>
  );
}
