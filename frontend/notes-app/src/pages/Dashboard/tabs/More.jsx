import React, { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../../utils/api';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePref, SHOW_BACKLOG } from '../../../utils/prefs';
import InstallApp from '../../../components/InstallApp';
import { Star, Moon, Shield, Bell, Globe, Database, HelpCircle, ChevronRight, LogOut, Edit2, History, Check, X } from 'lucide-react';
import { useAuth } from '../../../utils/AuthContext';
import { useNavigate } from 'react-router-dom';

const More = ({ user, theme, toggleTheme, showToast, refreshData }) => {
  const [showBacklog, setShowBacklog] = usePref(SHOW_BACKLOG, true);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    const name = draftName.trim();
    if (!name || name === user?.fullName) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await api.patch('/update-user', { fullName: name });
      // Everything showing the name reads it from the shared load.
      await refreshData?.();
      showToast?.('Name updated');
      setEditingName(false);
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not update your name', 'error');
    } finally {
      setSavingName(false);
    }
  };


  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-4">
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
          
          {/*
            The name is editable in place. A whole modal for one short text
            field is more ceremony than the change deserves, and the pencil
            beside it says it can be changed without a label explaining so.
          */}
          {editingName ? (
            <form
              onSubmit={saveName}
              className="flex items-center gap-2 mb-1"
              data-testid="name-form"
            >
              <input
                autoFocus
                value={draftName}
                maxLength={60}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }}
                aria-label="Your name"
                data-testid="name-input"
                className="w-44 bg-[#0d0f12] border border-white/15 rounded-lg px-3 h-9 text-center text-white text-lg font-bold"
              />
              <button
                type="submit"
                disabled={savingName || !draftName.trim()}
                aria-label="Save name"
                data-testid="name-save"
                className="w-9 h-9 grid place-items-center rounded-lg bg-[#c0b3a5] text-black disabled:opacity-40"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                aria-label="Cancel"
                className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"
              >
                <X size={15} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setDraftName(user?.fullName ?? ''); setEditingName(true); }}
              data-testid="name-edit"
              className="group flex items-center gap-2 mb-1 rounded-lg px-2 py-0.5 hover:bg-white/5 transition-colors"
            >
              <h2 className="text-lg font-bold text-white">{user?.fullName || 'Operator'}</h2>
              <Edit2 size={13} className="text-white/25 group-hover:text-[#c0b3a5] transition-colors" />
            </button>
          )}
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
              <Switch checked={isDark} onCheckedChange={toggleTheme} className="data-[checked]:bg-[#c0b3a5]" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Appearance</h3>
            <p className="text-xs text-white/60">Currently set to <span className="text-white font-bold">{isDark ? 'Dark' : 'Light'}</span></p>
          </Card>
        </motion.div>

        {/*
          Yesterday's unfinished work, on the home screen.
          Kept optional because the same list is a useful nudge to one person
          and a running tally of failure to another, and neither is wrong.
        */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.075 }}>
          <Card className="bg-[#16191e] border-white/5 rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40">
                <History size={16} />
              </div>
              <Switch
                checked={showBacklog}
                onCheckedChange={setShowBacklog}
                data-testid="pref-backlog"
                aria-label="Show unfinished work from earlier days"
                className="data-[checked]:bg-[#c0b3a5]"
              />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Carry over</h3>
            <p className="text-xs text-white/60">
              {showBacklog
                ? 'Unfinished work from earlier days stays on your home screen.'
                : "Earlier days are left behind. Today's list only."}
            </p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
          <InstallApp showToast={showToast} />
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
