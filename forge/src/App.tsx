import { useState } from 'react';
import TabBar from './components/TabBar';
import type { ScreenKey } from './screens/registry';
import HomeScreen from './screens/HomeScreen';
import RoadmapScreen from './screens/RoadmapScreen';
import StatsScreen from './screens/StatsScreen';
import ProfileScreen from './screens/ProfileScreen';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState<ScreenKey>('home');

  return (
    <div className="app">
      <main className="app__body">
        {screen === 'home' && <HomeScreen />}
        {screen === 'roadmap' && <RoadmapScreen />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'profile' && <ProfileScreen />}
      </main>
      <TabBar active={screen} onChange={setScreen} />
    </div>
  );
}
