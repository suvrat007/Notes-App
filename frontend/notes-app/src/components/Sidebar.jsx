import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Settings, Bell, CircleUser } from 'lucide-react';
import { TABS } from './navConfig';

const Sidebar = ({ active, onChange, onAddTask, user, showToast }) => (
  <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[#0a0a0c] border-r border-white/5 p-6 h-screen sticky top-0">
    <div className="mb-10">
      <h1 className="font-heading font-bold text-white text-xl tracking-widest">FOCUS</h1>
      <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase mt-1">Productivity Workspace</p>
    </div>

    <button 
      className="flex items-center justify-center gap-2 w-full bg-focus-green hover:bg-focus-green-soft text-white rounded-md py-3 font-semibold text-xs tracking-wider transition-colors mb-8"
      onClick={onAddTask}
    >
      <Plus size={16} /> ADD TASK
    </button>

    <nav className="flex flex-col gap-2 flex-1">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button 
            key={key} 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative ${isActive ? 'text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}
            onClick={() => onChange(key)}
          >
            {isActive && (
              <motion.span 
                layoutId="sidebar-active" 
                className="absolute inset-0 bg-white/10 rounded-lg" 
                transition={{ type: 'spring', stiffness: 400, damping: 35 }} 
              />
            )}
            <Icon size={18} className="relative z-10" />
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </nav>

    <div className="mt-auto pt-6 border-t border-white/5">
      <div className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors">
        <CircleUser size={32} className="text-white/80" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{user?.fullName}</p>
          <p className="text-xs text-white/40">{user?.totalStars} Stars</p>
        </div>
      </div>
      <div className="flex justify-between px-2">
        <button
          className="text-white/40 hover:text-white transition-colors"
          onClick={() => showToast?.('No new notifications')}
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <button
          className="text-white/40 hover:text-white transition-colors"
          onClick={() => onChange('more')}
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  </aside>
);

export default Sidebar;
