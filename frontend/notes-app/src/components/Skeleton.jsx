import React from 'react';

/**
 * A shimmering placeholder in the shape of what is coming.
 *
 * "Loading stats…" tells you nothing except that you are waiting. A block the
 * size and position of the real card says how long the wait is worth and stops
 * the page jumping when the data lands, because the space is already reserved.
 *
 * The shimmer is a moving highlight rather than a pulse: a pulse fades the
 * whole surface, which at this contrast reads as a rendering fault. It is one
 * background-position animation on a gradient — cheap enough to run on a dozen
 * blocks at once, and it respects prefers-reduced-motion by holding still.
 */
export const Skeleton = ({ className = '', rounded = 'rounded-lg', style }) => (
  <span
    aria-hidden="true"
    data-testid="skeleton"
    style={style}
    className={`block shimmer bg-white/[0.04] ${rounded} ${className}`}
  />
);

/** A card-shaped placeholder, matching the panels it stands in for. */
export const SkeletonCard = ({ children, className = '' }) => (
  <div className={`bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 ${className}`}>
    {children}
  </div>
);

/** The shape every screen with a header shares. */
export const SkeletonHeader = () => (
  <div className="space-y-2">
    <Skeleton className="h-7 w-44" />
    <Skeleton className="h-4 w-64" />
  </div>
);

/** A list of rows, as Habits, Tasks and the Ledger all render. */
export const SkeletonRows = ({ rows = 4, height = 'h-14' }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton
        key={i}
        rounded="rounded-2xl"
        className={`${height} w-full`}
        /* Staggered so it reads as a list filling in rather than one slab. */
        style={{ animationDelay: `${i * 90}ms` }}
      />
    ))}
  </div>
);

export default Skeleton;
