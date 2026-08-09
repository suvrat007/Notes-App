type Props = {
  tier: 1 | 2 | 3 | 4 | 5;
  color: string;
  level: number;
  size?: number;
};

/**
 * Rank avatar: a forged crest whose plating grows with the band tier.
 * Drawn as inline SVG so it ships offline with zero assets.
 */
export default function Avatar({ tier, color, level, size = 128 }: Props) {
  // Each tier adds a plate ring; tier 5 also gets the crown notches.
  const rings = Array.from({ length: tier }, (_, i) => 46 - i * 7);

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img"
         aria-label={`Rank tier ${tier}, level ${level}`}
         data-testid="avatar" data-tier={tier}>
      <defs>
        <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Shield silhouette */}
      <path
        d="M60 8 L104 24 V60 C104 86 84 104 60 112 C36 104 16 86 16 60 V24 Z"
        fill="url(#plate)"
        stroke={color}
        strokeWidth="2.5"
      />

      {/* Inner plates — one per tier */}
      {rings.map((r, i) => (
        <path
          key={r}
          d={`M60 ${8 + (60 - r)} L${60 + r} ${24 + (60 - r) * 0.4} V${60}
              C${60 + r} ${78} ${60 + r * 0.55} ${92} 60 ${100}
              C${60 - r * 0.55} ${92} ${60 - r} ${78} ${60 - r} ${60}
              V${24 + (60 - r) * 0.4} Z`}
          fill="none"
          stroke="#0d0f12"
          strokeOpacity={0.35 + i * 0.1}
          strokeWidth="1.5"
        />
      ))}

      {/* Crown notches at the top tier */}
      {tier === 5 && (
        <g fill={color}>
          <polygon points="46,14 52,4 58,14" />
          <polygon points="62,14 68,4 74,14" />
        </g>
      )}

      {/* Level numeral */}
      <text x="60" y="72" textAnchor="middle"
            fontSize="34" fontWeight="700" fill="#0d0f12"
            style={{ fontFamily: 'var(--font-display)' }}>
        {level}
      </text>
    </svg>
  );
}
