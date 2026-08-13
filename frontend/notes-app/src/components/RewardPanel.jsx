import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TIERS = [
  { pct: 20, label: 'Small' },
  { pct: 40, label: 'Fair' },
  { pct: 60, label: 'Heavy' },
  { pct: 80, label: 'Severe' },
  { pct: 100, label: 'Total' },
];

/**
 * Rewards, priced as a share of everything earned.
 *
 * A flat price ages badly: 200 stars is a fortune at level 2 and pocket change
 * at level 20, so the same cheesecake quietly stops meaning anything. The
 * percentage keeps the sting proportional — and the damage lands on the
 * lifetime total, so a week off really does cost rank.
 *
 * The server prices and charges; nothing here sends a number it made up.
 */
const RewardPanel = ({ rewards = [], lifetime = 0, refreshData, showToast }) => {
  const [name, setName] = useState('');
  const [pick, setPick] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  /**
   * The system's opening offer, mirrored from the server's own rule so the
   * quoted price does not jump the moment you press Add.
   */
  const suggest = (n) => {
    const s = (n || '').trim();
    if (!s) return 20;
    if (/\bweek off\b/i.test(s)) return 100;
    if (/\b(week|weekend|holiday|vacation|trip|days? off|time off|console|phone|laptop|watch|bike|tattoo|splurge)\b/i.test(s)) return 80;
    if (/\b(night out|dinner|concert|gig|match|game|massage|spa|shopping|takeaway|meal out)\b/i.test(s)) return 40;
    return 20;
  };

  const damage = pick ?? suggest(name);
  const previewCost = Math.ceil(Math.max(0, lifetime) * (damage / 100));

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/rewards', { name: name.trim(), damagePct: damage });
      setName('');
      setPick(null);
      refreshData();
      showToast?.('Reward added');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not add reward', 'error');
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (reward) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/rewards/${reward._id}/redeem`);
      setConfirming(null);
      refreshData();
      showToast?.(data.message || 'Redeemed');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not redeem', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (reward) => {
    try {
      await api.delete(`/rewards/${reward._id}`);
      refreshData();
      showToast?.('Reward removed');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not remove', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6"
      data-testid="rewards-panel"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-heading font-black text-white text-xl">Rewards</h3>
        <span className="text-[10px] font-bold text-white/40 tracking-wider">
          PRICED AS A SHARE OF YOUR TOTAL
        </span>
      </div>

      <div className="space-y-3">
        {rewards.map((r) => (
          <div
            key={r._id}
            className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-2xl px-4 py-3"
            data-testid={`reward-${r._id}`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#1e232b] flex items-center justify-center shrink-0">
              <Gift size={17} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{r.name}</p>
              <p className="text-[11px] text-white/50">
                <span data-testid={`cost-${r._id}`}>{r.cost}★</span>
                <span className="ml-2 px-1.5 py-0.5 rounded-full border border-white/10 text-[9px] tracking-wider"
                      data-testid={`pct-${r._id}`}>
                  {r.damagePct}%
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(r)}
              data-testid={`redeem-${r._id}`}
              className="px-4 py-1.5 bg-[#c0b3a5] text-black rounded-lg text-[10px] font-bold hover:scale-105 transition-transform disabled:opacity-40"
            >
              Redeem
            </button>
            <button
              type="button"
              onClick={() => remove(r)}
              aria-label={`Remove ${r.name}`}
              className="text-white/30 hover:text-focus-red transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        {rewards.length === 0 && (
          <p className="text-center text-white/40 text-sm py-6" data-testid="rewards-empty">
            Nothing to work towards yet. Name something worth earning.
          </p>
        )}
      </div>

      {/* ---- add a reward ---- */}
      <div className="mt-6 pt-5 border-t border-white/5 md:shrink-0">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Cheesecake"
            data-testid="reward-name"
            className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 h-11 flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="button"
            disabled={!name.trim() || busy}
            onClick={add}
            data-testid="reward-add"
            className="h-11 px-5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs tracking-wider rounded-md"
          >
            ADD
          </Button>
        </div>

        {/* The system opens with a guess so nobody prices a cheesecake from
            first principles; picking any tier overrides it for good. */}
        <div className="flex gap-1.5 mt-3" data-testid="reward-tiers">
          {TIERS.map((t) => (
            <button
              key={t.pct}
              type="button"
              onClick={() => setPick(t.pct)}
              data-testid={`tier-${t.pct}`}
              aria-pressed={damage === t.pct}
              className={`flex-1 py-2 rounded-xl border text-center transition-colors ${
                damage === t.pct
                  ? 'border-[#c0b3a5] text-[#c0b3a5]'
                  : 'border-white/10 text-white/40'
              }`}
            >
              <span className="block text-xs font-black tabular-nums">{t.pct}%</span>
              <span className="block text-[8px] tracking-widest uppercase">{t.label}</span>
            </button>
          ))}
        </div>

        <p className="text-[10px] text-white/40 mt-3" data-testid="tier-preview">
          {name.trim()
            ? `“${name.trim()}” would cost ${previewCost}★ right now — ${damage}% of your total.`
            : 'Name it and the cost is worked out as a share of your total.'}
        </p>
      </div>

      {/* ---- redeem confirmation ---- */}
      {confirming && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5"
             data-testid="redeem-confirm"
             onClick={() => setConfirming(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#16191e] border border-white/10 rounded-2xl p-7 w-full max-w-[380px]"
          >
            <h3 className="font-heading font-bold text-lg text-white mb-3">
              Redeem {confirming.name}?
            </h3>
            <p className="text-sm text-white/60 mb-6" data-testid="redeem-warning">
              That is {confirming.damagePct}% of everything you have earned —
              <b className="text-white"> {confirming.cost}★</b> — and your rank drops with it.
              Which is what makes it worth earning.
            </p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => redeem(confirming)}
              data-testid="redeem-yes"
              className="w-full h-12 bg-[#c0b3a5] hover:bg-[#cfc4b8] text-black font-bold tracking-widest text-xs rounded-xl"
            >
              REDEEM
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              data-testid="redeem-no"
              className="w-full h-11 mt-3 border border-white/10 text-white/60 rounded-xl text-xs font-bold tracking-widest hover:text-white transition-colors"
            >
              NOT YET
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default RewardPanel;
