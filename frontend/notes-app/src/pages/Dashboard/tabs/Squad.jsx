import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Users, Trophy, Check, X, Plus, LogIn } from 'lucide-react';
import api from '../../../utils/api';
import RankBadge from '../../../components/RankBadge';
import { SkeletonCard, SkeletonRows } from '../../../components/Skeleton';
import CrewDetail from '../../../components/CrewDetail';

/** Today, in the user's own timezone — the server scores by calendar day. */
const todayKey = () => new Date().toLocaleDateString('en-CA');

const PLACE_COLOUR = {
  1: 'text-[#e0b062]',
  2: 'text-[#c8ccd4]',
  3: 'text-[#c08457]',
};

const ordinal = (n) => {
  if (n === null || n === undefined) return '—';
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th';
  return `${n}${s}`;
};

/**
 * Friends and crews.
 *
 * Two different things on one page because they answer the same question from
 * different distances. Friends is a standing board — lifetime stars and rank,
 * the slow measure. A crew is this week only, scored on work everyone agreed
 * to, which is the part that actually makes a contest.
 */
const Squad = ({ showToast, refreshData }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCrew, setOpenCrew] = useState(null);

  const [friendEmail, setFriendEmail] = useState('');
  const [crewName, setCrewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/social', { params: { date: todayKey() } });
      setData(res.data);
      // A week that closed while nobody was looking pays out on this read, so
      // the star total on every other screen is now stale.
      if (res.data.payouts?.length) {
        for (const p of res.data.payouts) {
          showToast?.(`${ordinal(p.place)} in ${p.name} last week · +${p.award}★`);
        }
        refreshData?.();
      }
    } catch {
      showToast?.('Could not load your squad', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, refreshData]);

  useEffect(() => { load(); }, [load]);

  /** Every mutation here is small and ends in a reload, so they share one path. */
  const act = async (fn, successMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      showToast?.(successMsg ?? res?.data?.message ?? 'Done');
      await load();
      return true;
    } catch (err) {
      showToast?.(err.response?.data?.message || 'That did not work', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard><SkeletonRows rows={3} /></SkeletonCard>
        <SkeletonCard><SkeletonRows rows={2} /></SkeletonCard>
      </div>
    );
  }

  const { friends = [], incoming = [], crews = [] } = data || {};

  return (
    <div className="space-y-5 pb-4" data-testid="squad-page">
      <header>
        <h1 className="text-xl md:text-2xl font-bold font-heading text-white">Squad</h1>
        <p className="text-xs md:text-sm text-white/40 mt-1">Friends, crews and this week's standings</p>
      </header>

      {/* Invitations first: someone is waiting on an answer. */}
      {incoming.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-testid="incoming">
          <h2 className="text-[11px] font-bold text-[#c0b3a5] tracking-widest uppercase mb-2">
            Wants to be friends
          </h2>
          <div className="space-y-2">
            {incoming.map((p) => (
              <div key={p.linkId}
                className="flex items-center gap-3 bg-black/40 border border-white/5 border-l-[3px] border-l-[#c0b3a5] rounded-xl px-3 py-2.5">
                <RankBadge badge={p.rank.badge} color={p.rank.color} size="sm" />
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.fullName}</span>
                <button
                  data-testid={`accept-${p.linkId}`}
                  onClick={() => act(() => api.post(`/social/friends/${p.linkId}/accept`))}
                  aria-label={`Accept ${p.fullName}`}
                  className="w-8 h-8 rounded-lg bg-[#3ecf8e] text-black grid place-items-center shrink-0"
                >
                  <Check size={15} strokeWidth={3} />
                </button>
                <button
                  onClick={() => act(() => api.delete(`/social/friends/${p.linkId}`))}
                  aria-label={`Decline ${p.fullName}`}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 grid place-items-center shrink-0"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ---- Crews ---- */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold text-white/50 tracking-widest uppercase">Crews</h2>
          <span className="text-[10px] text-white/30">{crews.length} joined</span>
        </div>

        <div className="space-y-2">
          {crews.map((c) => (
            <button
              key={c._id}
              data-testid={`crew-${c._id}`}
              onClick={() => setOpenCrew(c._id)}
              className="w-full text-left bg-black/40 border border-white/5 border-l-[3px] border-l-[#e0b062] rounded-xl px-3 py-2.5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-[#2a2419] grid place-items-center shrink-0">
                  <Trophy size={14} className="text-[#e0b062]" />
                </span>
                <h4 className="flex-1 min-w-0 text-sm font-bold text-white truncate">{c.name}</h4>
                <span className={`font-heading font-black text-base leading-none tabular-nums shrink-0 ${
                  PLACE_COLOUR[c.myPlace] ?? 'text-white/30'}`}>
                  {ordinal(c.myPlace)}
                </span>
              </div>
              <p className="text-[11px] text-white/45 mt-1.5 truncate">
                {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                {` · ${c.myStars}★ this week`}
                {c.sharedCount > 0
                  ? ` · ${c.sharedCount} shared`
                  : ' · no shared tasks yet'}
              </p>
            </button>
          ))}

          {crews.length === 0 && (
            <p className="text-xs text-white/35 bg-black/20 border border-white/5 rounded-xl px-3 py-4 text-center">
              No crews yet. Start one and share the code, or join with a friend's.
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <form
            className="flex gap-2 flex-1"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!crewName.trim()) return;
              if (await act(() => api.post('/social/crews', { name: crewName.trim() }), 'Crew created')) {
                setCrewName('');
              }
            }}
          >
            <input
              value={crewName}
              onChange={(ev) => setCrewName(ev.target.value)}
              placeholder="New crew name"
              maxLength={40}
              aria-label="New crew name"
              data-testid="crew-name"
              className="flex-1 min-w-0 h-10 bg-[#0d0f12] border border-white/10 rounded-xl px-3 text-sm text-white placeholder:text-white/25"
            />
            <button type="submit" disabled={busy || !crewName.trim()} data-testid="crew-create"
              aria-label="Create crew"
              className="w-10 h-10 rounded-xl bg-[#c0b3a5] text-black grid place-items-center disabled:opacity-30 shrink-0">
              <Plus size={17} />
            </button>
          </form>

          <form
            className="flex gap-2 flex-1"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!joinCode.trim()) return;
              if (await act(() => api.post('/social/crews/join', { code: joinCode.trim(), date: todayKey() }))) {
                setJoinCode('');
              }
            }}
          >
            <input
              value={joinCode}
              onChange={(ev) => setJoinCode(ev.target.value.toUpperCase())}
              placeholder="Invite code"
              maxLength={6}
              aria-label="Invite code"
              data-testid="crew-code"
              className="flex-1 min-w-0 h-10 bg-[#0d0f12] border border-white/10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 tracking-[0.2em] font-mono uppercase"
            />
            <button type="submit" disabled={busy || !joinCode.trim()} data-testid="crew-join"
              aria-label="Join crew"
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 grid place-items-center disabled:opacity-30 shrink-0">
              <LogIn size={16} />
            </button>
          </form>
        </div>
      </motion.section>

      {/* ---- Friends ---- */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold text-white/50 tracking-widest uppercase">Friends</h2>
          <span className="text-[10px] text-white/30">by lifetime stars</span>
        </div>

        <div className="space-y-2" data-testid="friends-list">
          {friends.map((p, i) => (
            <div key={p.linkId} data-testid={`friend-${p._id}`}
              className="flex items-center gap-2.5 bg-black/40 border border-white/5 border-l-[3px] rounded-xl px-3 py-2.5"
              style={{ borderLeftColor: p.rank.color }}>
              <span className="w-5 text-center text-[11px] font-black tabular-nums text-white/30 shrink-0">
                {i + 1}
              </span>
              <RankBadge badge={p.rank.badge} color={p.rank.color} size="sm" title={p.rank.title} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.fullName}</p>
                <p className="text-[11px] text-white/45 truncate">
                  {p.rank.title} · Level {p.rank.level}
                </p>
              </div>
              <span className="font-heading font-black text-sm tabular-nums shrink-0" style={{ color: p.rank.color }}>
                {p.lifetime.toLocaleString()}★
              </span>
            </div>
          ))}

          {friends.length === 0 && (
            <p className="text-xs text-white/35 bg-black/20 border border-white/5 rounded-xl px-3 py-4 text-center">
              Nobody yet. Add someone by the email they signed up with.
            </p>
          )}
        </div>

        <form
          className="flex gap-2 mt-3"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (!friendEmail.trim()) return;
            if (await act(() => api.post('/social/friends', { email: friendEmail.trim() }))) {
              setFriendEmail('');
            }
          }}
        >
          <input
            type="email"
            value={friendEmail}
            onChange={(ev) => setFriendEmail(ev.target.value)}
            placeholder="friend@email.com"
            aria-label="Friend's email"
            data-testid="friend-email"
            className="flex-1 min-w-0 h-10 bg-[#0d0f12] border border-white/10 rounded-xl px-3 text-sm text-white placeholder:text-white/25"
          />
          <button type="submit" disabled={busy || !friendEmail.trim()} data-testid="friend-add"
            aria-label="Send friend invitation"
            className="w-10 h-10 rounded-xl bg-[#c0b3a5] text-black grid place-items-center disabled:opacity-30 shrink-0">
            <UserPlus size={16} />
          </button>
        </form>
      </motion.section>

      {openCrew && (
        <CrewDetail
          crewId={openCrew}
          onClose={() => setOpenCrew(null)}
          onChanged={() => { load(); refreshData?.(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Squad;
