import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Mic } from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../utils/ToastContext';
import { useAuth } from '../../utils/AuthContext';
import BottomNav from '../../components/BottomNav';
import Sidebar from '../../components/Sidebar';
import TaskModal from '../../components/TaskModal';
import VoiceModal from '../../components/VoiceModal';
import Home from './tabs/Home';
import Statistic from './tabs/Statistic';
import Calendar from './tabs/Calendar';
import Data from './tabs/Data';
import More from './tabs/More';

const TABS = { home: Home, statistic: Statistic, calendar: Calendar, data: Data, more: More };

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
  const [activeTab, setActiveTab] = useState('home');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
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
        api.get('/state'),
      ]);
      setUser(userRes.data.user);
      setTasks(taskRes.data.tasks);
      setLogs(logRes.data.logs);
      setState(stateRes.data);
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
    <div className="flex min-h-screen bg-[#0d0f12] text-white">
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        onAddTask={() => setIsModalOpen(true)}
        onVoice={() => setIsVoiceOpen(true)}
        user={user}
        showToast={showToast}
      />

      <div className="flex-1 min-w-0 flex justify-center">
        <div className="w-full max-w-[880px] flex flex-col h-full relative pb-28">
          
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

          <div className="p-6 md:p-10 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
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

          {/* Add stays centred where the thumb already expects it; the mic
              sits beside it rather than replacing it, because typing one
              precise task and speaking a whole messy day are different jobs. */}
          <button
            className="md:hidden fixed bottom-[84px] left-1/2 -translate-x-1/2 w-[52px] h-[52px] bg-white text-black rounded-full flex items-center justify-center shadow-lg z-[110] hover:-translate-y-1 transition-transform border border-black"
            onClick={() => setIsModalOpen(true)}
            aria-label="Add task"
          >
            <Plus size={24} />
          </button>

          <button
            className="md:hidden fixed bottom-[84px] left-1/2 translate-x-[26px] ml-3 w-[52px] h-[52px] bg-[#241f19] text-[#c0b3a5] rounded-full flex items-center justify-center shadow-lg z-[110] hover:-translate-y-1 transition-transform border border-[#c0b3a5]/30"
            onClick={() => setIsVoiceOpen(true)}
            aria-label="Speak your day"
            data-testid="fab-voice"
          >
            <Mic size={22} />
          </button>

          <BottomNav active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} refreshData={fetchData} showToast={showToast} />}

      {isVoiceOpen && (
        <VoiceModal
          habits={state?.habits ?? []}
          onClose={() => setIsVoiceOpen(false)}
          refreshData={fetchData}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Dashboard;
