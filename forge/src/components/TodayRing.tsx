type Props = {
  value: number;
  target: number;
  size?: number;
};

/** Circular progress: today's net stars against today's target. */
export default function TodayRing({ value, target, size = 148 }: Props) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safeTarget = target > 0 ? target : 1;
  const pct = Math.max(0, Math.min(1, value / safeTarget));
  const negative = value < 0;

  return (
    <div className="ring" data-testid="today-ring" data-pct={Math.round(pct * 100)}>
      <svg width={size} height={size} role="img"
           aria-label={`Today ${value} of ${target} stars`}>
        {/* Rotated so progress starts at 12 o'clock. */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--steel)" strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={negative ? 'var(--bad)' : 'var(--accent)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (negative ? 1 : pct))}
            style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(.4,0,.2,1)' }}
          />
        </g>
      </svg>

      <div className="ring__inner">
        <span className={'ring__value num' + (negative ? ' ring__value--neg' : '')}
              data-testid="ring-value">
          {value}
        </span>
        <span className="ring__target num">/ {target} ★</span>
      </div>
    </div>
  );
}
