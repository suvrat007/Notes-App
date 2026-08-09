import { shortDayName } from '../lib/dates';

type Props = {
  /** Chronological, length = weeks * 7, starting on a Monday. */
  points: { date: string; value: number }[];
  max: number;
};

/**
 * GitHub-style calendar. Sequential single-hue ramp (ember) — on a dark
 * surface the ramp runs dim→bright, which is the dark-mode equivalent of
 * light→dark. Intensity is opacity of one hue, never multiple hues.
 */
export default function Heatmap({ points, max }: Props) {
  // Columns are weeks, rows are weekdays (Mon..Sun).
  const weeks: typeof points[] = [];
  for (let i = 0; i < points.length; i += 7) weeks.push(points.slice(i, i + 7));

  const level = (v: number) => {
    if (v <= 0) return 0;
    if (max <= 0) return 0;
    // 4 discrete steps read better than a continuous ramp at this cell size.
    return Math.min(4, Math.ceil((v / max) * 4));
  };
  const alpha = [0, 0.25, 0.45, 0.7, 1];

  return (
    <div className="heat" data-testid="heatmap">
      <div className="heat__days">
        {[0, 2, 4].map((i) => (
          <span key={i} className="heat__daylabel" style={{ gridRow: i + 1 }}>
            {points[i] ? shortDayName(points[i].date) : ''}
          </span>
        ))}
      </div>
      <div className="heat__grid">
        {weeks.map((w, wi) => (
          <div className="heat__col" key={wi}>
            {w.map((p) => {
              const lv = level(p.value);
              return (
                <div
                  key={p.date}
                  className="heat__cell"
                  data-date={p.date}
                  data-level={lv}
                  title={`${p.date}: ${p.value} rep${p.value === 1 ? '' : 's'}`}
                  style={{
                    background: lv === 0
                      ? 'var(--steel)'
                      : `rgba(255, 106, 43, ${alpha[lv]})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
