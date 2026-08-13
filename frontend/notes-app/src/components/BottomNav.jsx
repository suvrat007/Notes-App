import React from 'react';
import { motion } from 'framer-motion';
import { TABS } from './navConfig';

const BottomNav = ({ active, onChange }) => (
  <nav className="md:hidden fixed left-1/2 bottom-4 -translate-x-1/2 w-[calc(100%-24px)] max-w-[420px] h-16 bg-[#121214] border border-white/5 rounded-2xl shadow-xl flex items-center justify-between px-2 z-[100]">
    {TABS.map(({ key, label, icon: Icon }) => {
      const isActive = active === key;
      return (
        <button
          key={key}
          className={`flex flex-col items-center gap-1 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-[10px] font-medium py-2 rounded-xl transition-colors relative whitespace-nowrap ${isActive ? 'text-focus-green' : 'text-white/40'}`}
          onClick={() => onChange(key)}
          aria-label={label}
          aria-current={isActive}
        >
          {isActive && (
            <motion.span 
              layoutId="nav-pill" 
              className="absolute inset-0 bg-white/5 rounded-xl z-[-1]" 
              transition={{ type: 'spring', stiffness: 400, damping: 35 }} 
            />
          )}
          <Icon size={20} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      );
    })}
  </nav>
);

export default BottomNav;
