import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import api from '../../utils/api';
import { useToast } from '../../utils/ToastContext';
import { useAuth } from '../../utils/AuthContext';
import { DataProvider } from '../../utils/DataContext';
import BottomNav from '../../components/BottomNav';
import Sidebar from '../../components/Sidebar';
import TaskModal from '../../components/TaskModal';
import VoiceModal from '../../components/VoiceModal';
import HabitModal from '../../components/HabitModal';
import AddFab from '../../components/AddFab';
import Home from './tabs/Home';
import Statistic from './tabs/Statistic';
import Calendar from './tabs/Calendar';
import Data from './tabs/Data';
import More from './tabs/More';
import Manage from './tabs/Manage';
import Roadmap from './tabs/Roadmap';

const TABS = { home: Home, statistic: Statistic, calendar: Calendar, data: Data, more: More, manage: Manage, roadmap: Roadmap };

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  // The whole day in one shot: habits with their reps, tasks, work carried
  // over, priced rewards and the rank. Six calls would each re-read the
  // ledger and land out of order.
  const [state, setState] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isHabitOpen, setIsHabitOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  // Bumped by every write so the screens holding their own fetch reload too.
  const [version, setVersion] = useState(0);
  const showToast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const fetchData = useCallback(async () => {
    try {
      const [userRes, taskRes, logRes, stateRes] = await Promise.all([
        api.get('/get-user'),
        api.get('/tasks'),
        api.get('/logs'),
        /*
         * The day is the USER'S, not the server's. A server running in UTC
         * thinks it is still yesterday until 5:30am in India, and would hand
         * back an empty plan for a day that has clearly started.
         */
        api.get(`/state?date=${new Date().toLocaleDateString('en-CA')}`),
      ]);
      setUser(userRes.data.user);
      setTasks(taskRes.data.tasks);
      setLogs(logRes.data.logs);
      setState(stateRes.data);
      setVersion((v) => v + 1);
    } catch (err) {
      if (err.response?.status !== 401) {
        showToast('Could not load your data', 'error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  const ActiveTab = TABS[activeTab];

  return (
    <DataProvider version={version} refresh={fetchData}>
    <div className="flex min-h-screen bg-[#0d0f12] text-white">
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        user={user}
        rank={state?.stars?.rank}
        lifetime={state?.stars?.lifetime}
        showToast={showToast}
      />

      {/*
        Desktop is a fixed-height workspace, not a document. The rail is
        already pinned, so letting the page scroll as a whole moves the
        content out from under a nav that stays put, and on a dashboard the
        point is to see the day at once. Anything too tall scrolls INSIDE its
        own panel instead. The phone keeps ordinary page scrolling, because
        one column of cards on a small screen is a document.
      */}
      <div className="flex-1 min-w-0 flex justify-start md:h-screen md:overflow-hidden">
        <div className="w-full flex flex-col h-full relative pb-28 md:pb-0">
          
          {/* Mobile Header */}
          <header className="md:hidden flex items-center justify-between px-6 py-5 sticky top-0 bg-[#0d0f12]/80 backdrop-blur-md z-40 border-b border-white/5">
            <div className="flex items-center gap-4">
              <button className="text-white/80 hover:text-white"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>
              <span className="font-heading font-bold text-white tracking-widest text-lg">FOCUS</span>
            </div>
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-[#16191e]">
              {/* Dummy avatar as seen in screenshot */}
              <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">{user?.fullName?.charAt(0)}</div>
            </div>
          </header>

          {/*
            Scrolls when a page genuinely needs it, never clips. Pages that fit
, Home, Calendar, Stats, fill the height and stay still; a long
            settings list is allowed to scroll rather than be cut off.
          */}
          <div className="p-6 md:px-8 md:py-7 flex-1 md:min-h-0 md:overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                className="md:h-full md:min-h-0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <ActiveTab
                  user={user}
                  tasks={tasks}
                  state={state}
                  logs={logs}
                  refreshData={fetchData}
                  showToast={showToast}
                  theme={theme}
                  toggleTheme={toggleTheme}
                  onNavigate={setActiveTab}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <BottomNav active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      <AddFab onPick={(action) => {
        if (action === 'speak') setIsVoiceOpen(true);
        else if (action === 'task') setIsModalOpen(true);
        else setIsHabitOpen(true);
      }} />

      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} refreshData={fetchData} showToast={showToast} />}

      {isHabitOpen && (
        <HabitModal
          onClose={() => setIsHabitOpen(false)}
          refreshData={fetchData}
          showToast={showToast}
        />
      )}

      {isVoiceOpen && (
        <VoiceModal
          habits={state?.habits ?? []}
          onClose={() => setIsVoiceOpen(false)}
          refreshData={fetchData}
          showToast={showToast}
        />
      )}
    </div>
    </DataProvider>
  );
};

export default Dashboard;
