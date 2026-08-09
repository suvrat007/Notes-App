import { AnimatePresence, motion } from 'framer-motion';

export type Delta = { id: number; value: number; x: number; y: number };

type Props = { deltas: Delta[] };

/**
 * Floating +10 / −15 that rises and fades from the tap point.
 * Fixed-position and pointer-events:none so it never blocks rapid tapping.
 */
export default function FloatingDelta({ deltas }: Props) {
  return (
    <AnimatePresence>
      {deltas.map((d) => (
        <motion.span
          key={d.id}
          className={'fdelta num' + (d.value < 0 ? ' fdelta--neg' : '')}
          data-testid="floating-delta"
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: -42, scale: 1 }}
          exit={{ opacity: 0, y: -64 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ left: d.x, top: d.y }}
        >
          {d.value > 0 ? '+' : ''}{d.value}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}
