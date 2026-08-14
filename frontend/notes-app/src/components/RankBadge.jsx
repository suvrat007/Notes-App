import React from 'react';

/**
 * The emblem for a rank.
 *
 * Ten shapes that escalate the way real insignia do: chevrons for the early
 * ranks, shields once you are holding a line, stars for the ones most people
 * never see, a crown at the top. Drawn rather than fetched, so a badge cannot
 * fail to load and adds nothing to the bundle beyond its own path data.
 *
 * The server names the shape and the colour; this only draws it. That keeps
 * the ladder's meaning in one place — a client that invented its own badge
 * would be a scoreboard editing itself.
 */

/* Each shape is authored in a 24x24 box and inherits `currentColor`. */
const SHAPES = {
  chevron1: (
    <path d="M4 15l8-6 8 6" />
  ),
  chevron2: (
    <>
      <path d="M4 17l8-6 8 6" />
      <path d="M4 11l8-6 8 6" />
    </>
  ),
  chevron3: (
    <>
      <path d="M4 19l8-5 8 5" />
      <path d="M4 14l8-5 8 5" />
      <path d="M4 9l8-5 8 5" />
    </>
  ),
  shield: (
    <path d="M12 3l7 3v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6l7-3z" />
  ),
  shieldBar: (
    <>
      <path d="M12 3l7 3v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6l7-3z" />
      <path d="M8.5 11h7" />
    </>
  ),
  diamond: (
    <>
      <path d="M12 2l7 10-7 10-7-10 7-10z" />
      <path d="M12 7l3.5 5-3.5 5-3.5-5L12 7z" />
    </>
  ),
  star: (
    <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.7 6.1 20.8l1.2-6.6L2.5 9.5l6.6-.9L12 2.5z" />
  ),
  starCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5l1.9 4 4.3.6-3.1 3 .8 4.3-3.9-2-3.9 2 .8-4.3-3.1-3 4.3-.6L12 6.5z" />
    </>
  ),
  blades: (
    <>
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
      <path d="M12 3.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.8l5-.7L12 3.5z" />
    </>
  ),
  crown: (
    <>
      <path d="M3 8l4 4 5-8 5 8 4-4-2 12H5L3 8z" />
      <path d="M5 20h14" />
    </>
  ),
};

const SIZES = { sm: 16, md: 22, lg: 34 };

const RankBadge = ({ badge, color = '#c0b3a5', size = 'md', title, className = '' }) => {
  const shape = SHAPES[badge] ?? SHAPES.chevron1;
  const px = SIZES[size] ?? SIZES.md;

  return (
    <span
      data-testid={`rank-badge-${badge ?? 'none'}`}
      title={title}
      /* A ring in the rank's own colour, so the badge reads as an emblem
         rather than a loose icon sitting next to the text. */
      className={`inline-grid place-items-center shrink-0 rounded-lg border ${className}`}
      style={{
        width: px + 12,
        height: px + 12,
        color,
        borderColor: `${color}55`,
        background: `${color}14`,
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {shape}
      </svg>
    </span>
  );
};

export default RankBadge;
