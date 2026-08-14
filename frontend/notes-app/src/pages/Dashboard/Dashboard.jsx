import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import api from '../../utils/api';
import { useToast } from '../../utils/ToastContext';
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

  if (!user) {
    /*
       Matches the pre-mount spinner in index.html, so the handover from static
       HTML to React is invisible. The old one leaned on --text-secondary and a
       .app-shell class, which resolve against the LIGHT palette until the theme
       attribute is set — a white panel in the middle of a dark app.
    */
    return (
      <div className="min-h-[100dvh] grid place-content-center justify-items-center gap-[18px] bg-[#0d0f12]">
        <span className="text-[15px] font-extrabold tracking-[0.32em] text-[#c0b3a5]">FOCUS</span>
        <span className="w-[26px] h-[26px] rounded-full border-2 border-white/10 border-t-[#c0b3a5] animate-spin motion-reduce:[animation-duration:2.4s]" />
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
            {/*
              Both of these were decoration: a hamburger with no handler and an
              avatar that was a div. A control that looks pressable and does
              nothing is worse than no control, so they now go somewhere.
            */}
            <div className="flex items-center gap-3">
              <span className="font-heading font-bold text-white tracking-widest text-lg">FOCUS</span>
            </div>
            <button
              type="button"
              aria-label="Your profile"
              data-testid="mobile-avatar"
              onClick={() => setActiveTab('more')}
              className="w-10 h-10 grid place-items-center rounded-full hover:bg-white/5 transition-colors"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-white/10"
                />
              ) : (
                <span className="w-8 h-8 rounded-full border border-white/10 bg-[#16191e] grid place-items-center text-[11px] font-bold text-white/60">
                  {user?.fullName?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </button>
          </header>

          {/*
            Scrolls when a page genuinely needs it, never clips. Pages that fit
, Home, Calendar, Stats, fill the height and stay still; a long
            settings list is allowed to scroll rather than be cut off.
          */}
          <div className="p-4 pb-28 sm:p-6 sm:pb-28 md:px-8 md:pt-7 md:pb-24 flex-1 md:min-h-0 md:overflow-y-auto">
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

      {/* Today's tasks go to the voice modal too, so "I did three of them" can
          point at a real one instead of creating a second copy of it. */}
      {isVoiceOpen && (
        <VoiceModal
          habits={state?.habits ?? []}
          tasks={state?.tasks ?? []}
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
