import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, X } from 'lucide-react';
import api from '../utils/api';
import { removeFromGoogle } from '../utils/googleSync';

/**
 * "That's done — take it off your calendar too?"
 *
 * A tracker that only ever ADDS to a calendar makes the calendar worse. Once
 * the work is finished the entry is noise, and on a shared calendar it is
 * worse than noise: it still tells colleagues you are busy.
 *
 * Asking rather than doing it is the whole point. The calendar is not this
 * app's to prune, and silently deleting something a person put in their own
 * calendar is the kind of surprise that ends trust in a sync for good. So it
 * offers, once, and takes no for an answer — "keep it" clears the link so the
 * same task never asks twice.
 */
const GoogleCleanup = ({ task, onClose, refreshData, showToast }) => {
  const [busy, setBusy] = useState(false);

  const where = [
    task.googleEventId && 'Calendar',
    task.googleTaskId && 'Tasks',
  ].filter(Boolean).join(' and ');

  /** Forget the link locally, whatever was decided about Google's copy. */
  const unlink = () =>
    api.patch(`/tasks/${task._id}`, { googleEventId: null, googleTaskId: null });

  const remove = async () => {
    setBusy(true);
    try {
      await removeFromGoogle(task);
      await unlink();
      showToast?.(`Removed from Google ${where}`);
      await refreshData?.();
      onClose();
    } catch (err) {
      // The local link stays, so it can be tried again rather than stranded.
      showToast?.(err.message || 'Could not remove it from Google', 'error');
      setBusy(false);
    }
  };

  const keep = async () => {
    setBusy(true);
    try {
      await unlink();
      await refreshData?.();
    } catch {
      /* not being able to forget the link is not worth an error here */
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-[1100] sm:p-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: 'easeOut' }}
        data-testid="google-cleanup"
        className="bg-[#16191e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-[400px] relative"
      >
        <button
          onClick={keep}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/60 hover:text-white"
        >
          <X size={16} />
        </button>

        <span className="w-10 h-10 rounded-xl bg-[#1e2a24] grid place-items-center">
          <CalendarCheck size={18} className="text-[#3ecf8e]" />
        </span>

        <h2 className="font-heading font-black text-lg text-white mt-3 pr-8">Done — tidy up?</h2>
        <p className="text-sm text-white/60 mt-1.5">
          <span className="text-white font-bold">{task.title}</span> is finished.
          Remove it from your Google {where}?
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={remove}
            disabled={busy}
            data-testid="google-remove"
            className="flex-1 h-11 rounded-xl bg-[#c0b3a5] text-black text-xs font-bold tracking-widest disabled:opacity-40"
          >
            {busy ? 'REMOVING…' : 'REMOVE IT'}
          </button>
          <button
            onClick={keep}
            disabled={busy}
            data-testid="google-keep"
            className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-bold tracking-widest disabled:opacity-40"
          >
            KEEP IT
          </button>
        </div>

        <p className="text-[10px] text-white/30 mt-3 text-center">
          Either way, this task will not ask again.
        </p>
      </motion.div>
    </div>
  );
};

export default GoogleCleanup;
