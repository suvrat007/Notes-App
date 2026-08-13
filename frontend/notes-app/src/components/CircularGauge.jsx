import React from 'react';
import { motion } from 'framer-motion';

// Arc gauge in the style of the reference design: a thick ring sweeping ~270deg
// with a soft glow, animated fill, and a label stacked in the center.
const CircularGauge = ({ value, max, label, sublabel, size = 220 }) => {
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const startAngle = -220; // degrees
  const sweep = 260; // degrees of travel
  const circumference = (sweep / 360) * 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  const polarToCartesian = (angleDeg) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: size / 2 + radius * Math.cos(angleRad),
      y: size / 2 + radius * Math.sin(angleRad),
    };
  };

  const describeArc = (startDeg, endDeg) => {
    const start = polarToCartesian(startDeg);
    const end = polarToCartesian(endDeg);
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const trackPath = describeArc(startAngle, startAngle + sweep);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--text-primary)" />
            <stop offset="100%" stopColor="var(--accent-gold)" />
          </linearGradient>
        </defs>
        <path d={trackPath} fill="none" stroke="rgba(127,127,127,0.15)" strokeWidth={stroke} strokeLinecap="round" />
        <motion.path
          d={trackPath}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 10px var(--glow-color))' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          style={{ fontSize: '2.4rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}
        >
          {value}
        </motion.span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}</span>
        {sublabel && <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{sublabel}</span>}
      </div>
    </div>
  );
};

export default CircularGauge;
