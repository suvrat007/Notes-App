import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, CircleUser } from 'lucide-react';
import RankBadge from './RankBadge';
import { TABS } from './navConfig';

const Sidebar = ({ active, onChange, user, rank, lifetime, showToast }) => (
  <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[#0d0f12] border-r border-white/5 p-6 h-screen sticky top-0">
    <div className="mb-10">
      <h1 className="font-heading font-bold text-white text-xl tracking-widest">FOCUS</h1>
      <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase mt-1">Productivity Workspace</p>
    </div>

    {/* Adding anything lives in the floating + now. It is reachable from every
        screen, and two ways in only meant two things to keep in sync. */}

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
      {/*
        Rank sits with the name, not buried in a stats tab. It is the one
        number the whole app is scored on, and seeing it every time you glance
        at the corner is the point of having ranks at all.
      */}
      {rank && (
        <div className="mb-3 px-2" data-testid="sidebar-rank">
          <p className="text-[10px] tracking-widest uppercase text-white/40 mb-1.5">You are</p>
          <div className="flex items-center gap-2.5">
            <RankBadge badge={rank.badge} color={rank.color} size="md" title={rank.title} />
            <div className="min-w-0">
              <span
                className="block font-heading font-black text-lg leading-none tracking-wide truncate"
                style={{ color: rank.color }}
              >
                {rank.title}
              </span>
              <span className="block font-heading font-bold text-[11px] text-white/50 mt-0.5">
                LVL {rank.level}
              </span>
            </div>
          </div>
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(rank.progress * 100)}%`, background: rank.color }}
            />
          </div>
          <p className="text-[10px] text-white/35 mt-1.5">
            {rank.nextAt === null
              ? 'Highest rank reached'
              : `${rank.toNext}★ to level ${rank.level + 1}`}
          </p>
          {/* The next NAMED rank, which is the thing actually worth wanting. */}
          {rank.nextTitle && (
            <p className="text-[10px] text-white/25 mt-0.5 truncate">
              Next rank: {rank.nextTitle}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors">
        {user?.avatarUrl
          ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer"
                 className="w-8 h-8 rounded-full object-cover shrink-0" />
          : <CircleUser size={32} className="text-white/80" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{user?.fullName}</p>
          <p className="text-xs text-white/40">{(lifetime ?? user?.totalStars ?? 0)} Stars</p>
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
