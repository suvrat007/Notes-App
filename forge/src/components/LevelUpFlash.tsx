import { AnimatePresence, motion } from 'framer-motion';
import type { RankInfo } from '../engine/rank';

type Props = {
  rank: RankInfo | null;
  onDone: () => void;
};

/** One-shot celebration when a level threshold is crossed. */
export default function LevelUpFlash({ rank, onDone }: Props) {
  return (
    <AnimatePresence onExitComplete={onDone}>
      {rank && (
        <motion.div
          className="levelup"
          data-testid="levelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onDone}
        >
          <motion.div
            className="levelup__card"
            style={{ borderColor: rank.color }}
            initial={{ scale: 0.85, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <span className="levelup__eyebrow">Rank up</span>
            <span className="levelup__level num" style={{ color: rank.color }}>
              {rank.level}
            </span>
            <span className="levelup__title">{rank.title}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
