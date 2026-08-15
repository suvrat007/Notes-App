import React from 'react';

/**
 * THE row. Habits, tasks and carried work all use this one.
 *
 * Two lines, because one never fit. Sharing a single row with a counter left
 * the name about ninety pixels on a phone, so it either truncated to "make
 * financial rati…" or wrapped into a four-line column split mid-word — and the
 * name is the one thing the row exists to say.
 *
 *   line 1   icon · name ......................... figure
 *   line 2   terms ............................. controls
 *
 * The figure is what the row is scored on (4/7, 0/1, 2/5); the terms are what
 * it costs or earns. Keeping the shape identical everywhere means a habit and
 * a task read the same way, and there is one place to change when they should
 * both look different.
 */
const EntryRow = ({
  icon: Icon,
  accent = 'text-[#c0b3a5]',
  tile = 'bg-[#241f19]',
  edge = 'border-l-[#c0b3a5]',
  title,
  titleStruck = false,
  titleAttr,
  figure,
  figureLit = false,
  figureTestId,
  figureAttrs,
  terms,
  controls,
  testId,
  ...rest
}) => (
  <div
    className={`bg-black/40 border border-white/5 rounded-xl ${edge} border-l-[3px] px-3 py-2`}
    data-testid={testId}
    {...rest}
  >
    <div className="flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-lg ${tile} grid place-items-center shrink-0`}>
        {Icon && <Icon size={14} className={accent} />}
      </span>

      {/* Struck through, never removed. A finished row is evidence the day went
          well; deleting it makes the list look like nothing happened. Two lines
          at most, so a long name cannot push the controls off the card. */}
      <h4
        className={`flex-1 min-w-0 text-sm font-bold leading-snug line-clamp-2 ${
          titleStruck ? 'text-white/35 line-through' : 'text-white'
        }`}
        title={titleAttr ?? (typeof title === 'string' ? title : undefined)}
      >
        {title}
      </h4>

      {figure != null && (
        <span
          data-testid={figureTestId}
          {...figureAttrs}
          className={`font-heading font-black text-base leading-none tabular-nums shrink-0 ${
            figureLit ? accent : 'text-white/30'
          }`}
        >
          {figure}
        </span>
      )}
    </div>

    <div className="flex items-center gap-2 mt-1.5">
      <p className="flex-1 min-w-0 text-[11px] text-white/45 truncate">{terms}</p>
      {controls}
    </div>
  </div>
);

export default EntryRow;
