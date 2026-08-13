import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Star, Moon, Shield, Bell, Globe, Database, HelpCircle, ChevronRight, LogOut, Edit2 } from 'lucide-react';
import { useAuth } from '../../../utils/AuthContext';
import { useNavigate } from 'react-router-dom';

const More = ({ user, theme, toggleTheme, showToast }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="hidden md:block">
        <h1 className="text-2xl font-bold font-heading text-white">More</h1>
        <p className="text-sm text-white/40 mt-1">Account & preferences</p>
      </header>

      {/* Mobile only header */}
      <div className="md:hidden pt-2 mb-2">
        <h1 className="text-xl font-bold font-heading text-white">More</h1>
        <p className="text-xs text-white/40 mt-1">Account & preferences</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-[#16191e] border-white/5 rounded-xl p-6 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center">
              <span className="text-2xl text-white/40 font-bold">{user?.fullName?.charAt(0) || 'A'}</span>
            </div>
            <button
              className="absolute bottom-0 right-0 w-6 h-6 bg-white/30 text-black/60 rounded-full flex items-center justify-center shadow cursor-not-allowed"
              onClick={() => showToast?.('Profile photo upload is coming soon')}
              aria-label="Edit profile photo (coming soon)"
            >
              <Edit2 size={10} />
            </button>
          </div>
          
          <h2 className="text-lg font-bold text-white mb-1">{user?.fullName || 'Operator'}</h2>
          <p className="text-sm text-focus-teal mb-4">{user?.email || 'operator@focus.io'}</p>
          
          <div className="bg-[#1e2a24] text-[#c0b3a5] px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
            <div className="bg-[#c0b3a5] text-black w-4 h-4 rounded-full flex items-center justify-center">
              <Star size={10} fill="currentColor" />
            </div>
            {user?.totalStars?.toLocaleString() || '0'} Total Stars
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Appearance */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#16191e] border-white/5 rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40">
                <Moon size={16} />
              </div>
              <Switch checked={isDark} onCheckedChange={toggleTheme} className="data-[state=checked]:bg-[#c0b3a5]" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Appearance</h3>
            <p className="text-xs text-white/60">Currently set to <span className="text-white font-bold">{isDark ? 'Dark' : 'Light'}</span></p>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#16191e] border-white/5 rounded-xl p-5 opacity-60 cursor-not-allowed relative">
            <span className="absolute top-3 right-3 text-[9px] font-bold tracking-widest text-white/30 uppercase">Soon</span>
            <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40 mb-4">
              <Shield size={16} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Security</h3>
            <p className="text-xs text-white/60">Manage 2FA and sessions</p>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h3 className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4 mt-6">Settings</h3>
        <Card className="bg-[#16191e] border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
          {[
            { icon: Bell, label: 'Notifications' },
            { icon: Globe, label: 'Language', value: 'English' },
            { icon: Database, label: 'Storage & Data' },
            { icon: HelpCircle, label: 'Support' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                className="w-full flex items-center justify-between p-4 opacity-60 cursor-not-allowed"
                onClick={() => showToast?.(`${item.label} is coming soon`)}
              >
                <div className="flex items-center gap-4">
                  <Icon size={18} className="text-white/40" />
                  <span className="text-sm font-semibold text-white/80">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold tracking-widest text-white/30 uppercase">Soon</span>
                  <ChevronRight size={16} className="text-white/20" />
                </div>
              </button>
            );
          })}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="pt-8">
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase mb-4">End Session</span>
          <button 
            onClick={handleLogout}
            className="w-full h-12 border border-[#3a1f1f] bg-transparent text-[#e87070] rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest hover:bg-[#3a1f1f]/50 transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default More;
