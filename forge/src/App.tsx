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
import ManageScreen from './screens/ManageScreen';
import { useForge } from './store/useForge';
import { useNav } from './store/useNav';
import { trySilentAuth } from './lib/google/auth';
import { drainQueue } from './db/sync';
import './App.css';

export default function App() {
  const screen = useNav((s) => s.screen);
  const setScreen = useNav((s) => s.setScreen);
  const [voice, setVoice] = useState(false);
  const loadToday = useForge((s) => s.loadToday);

  // The sidebar reads store state, so the store must be warm before any
  // screen mounts — otherwise the rail flashes empty on a desktop load.
  useEffect(() => { void loadToday(); }, [loadToday]);

  // Google sync catch-up. Nothing can be pushed while the app is closed (a
  // browser-only OAuth client has no refresh token), so startup is the moment
  // anything queued since last time actually goes out. Both paths are silent:
  // no token means no drain, and no drain means the queue simply waits.
  useEffect(() => {
    const catchUp = async () => {
      if (await trySilentAuth()) await drainQueue();
    };
    void catchUp();

    // Coming back online is the other moment a stalled queue can move.
    const onOnline = () => { void catchUp(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return (
    <div className="app">
      <Sidebar active={screen} onChange={setScreen} onVoice={() => setVoice(true)} />

      <main className="app__body">
        {screen === 'home' && <HomeScreen />}
        {screen === 'roadmap' && <RoadmapScreen />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'manage' && <ManageScreen />}
        {screen === 'profile' && <ProfileScreen />}
      </main>

      <TabBar active={screen} onChange={setScreen} />

      {voice && (
        <VoiceModal
          onClose={() => setVoice(false)}
          onNavigate={(s) => setScreen(s as ScreenKey)}
        />
      )}

      <Toaster />
    </div>
  );
}
