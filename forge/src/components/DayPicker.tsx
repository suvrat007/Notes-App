import { addDays, shortDayName } from '../lib/dates';
import { MAX_BACKFILL_DAYS } from '../store/useForge';

type Props = {
  today: string;
  activeDate: string;
  onPick: (date: string) => void;
};

const LABELS = ['Today', 'Yesterday'];

/**
 * Step back to fill in a day you missed.
 *
 * Only the last few days are offered: catching up on yesterday is normal, but
 * retro-dating weeks of reps would make streaks and pace meaningless, and
 * nothing can verify it happened.
 */
export default function DayPicker({ today, activeDate, onPick }: Props) {
  const days = Array.from({ length: MAX_BACKFILL_DAYS + 1 }, (_, i) => addDays(today, -i));
  const backfilling = activeDate !== today;

  return (
    <div className={'daypick' + (backfilling ? ' daypick--back' : '')} data-testid="day-picker">
      {days.map((d, i) => (
        <button
          key={d}
          className={'daypick__opt' + (d === activeDate ? ' daypick__opt--on' : '')}
          data-testid={`day-${i}`}
          aria-pressed={d === activeDate}
          onClick={() => onPick(d)}
        >
          {LABELS[i] ?? shortDayName(d)}
        </button>
      ))}

      {backfilling && (
        <span className="daypick__note" data-testid="backfill-note">
          filling in {activeDate}
        </span>
      )}
    </div>
  );
}
