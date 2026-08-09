import { useForge } from '../store/useForge';
import { rankFor } from '../engine/rank';
import { SCREENS, type ScreenKey } from '../screens/registry';
import { IconMic } from './icons';

type Props = {
  active: ScreenKey;
  onChange: (key: ScreenKey) => void;
  onVoice: () => void;
};

/**
 * Desktop navigation rail. Shown only at >= 1024px, where the bottom tab bar
 * is hidden — the two never coexist.
 *
 * It carries what a phone has no room for: a brand mark, per-item context,
 * the live rank crest and the week's balance, so the persistent chrome is
 * doing real work rather than being a stretched tab bar.
 */
export default function Sidebar({ active, onChange, onVoice }: Props) {
  const { appState, weekBalance, ready } = useForge();
  const lifetime = appState?.lifetimeStars ?? 0;
  const rank = rankFor(lifetime);
  const balance = ready ? weekBalance() : 0;

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <img src="/icon.svg" alt="" className="sidebar__mark" width={30} height={30} />
        <span className="sidebar__wordmark">FORGE</span>
      </div>

      <nav className="sidebar__nav">
        {SCREENS.map(({ key, label, blurb, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              className={'snav' + (isActive ? ' snav--active' : '')}
              onClick={() => onChange(key)}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`snav-${key}`}
            >
              <span className="snav__icon"><Icon size={20} /></span>
              <span className="snav__text">
                <span className="snav__label">{label}</span>
                <span className="snav__blurb">{blurb}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <button className="sidebar__voice" onClick={onVoice} data-testid="snav-voice">
        <IconMic size={18} />
        <span>Speak your day</span>
      </button>

      <div className="sidebar__foot">
        <div className="sidebar__rank" style={{ borderColor: rank.color }}>
          <span className="sidebar__level num" style={{ color: rank.color }}>
            {rank.level}
          </span>
          <span className="sidebar__ranktext">
            <span className="sidebar__title" style={{ color: rank.color }}>{rank.title}</span>
            <span className="sidebar__life num">{lifetime} ★ lifetime</span>
          </span>
        </div>
        <div className="sidebar__bal">
          <span className="sidebar__ballabel">This week</span>
          <span className={'sidebar__balval num' + (balance < 0 ? ' stat__value--neg' : '')}>
            {balance > 0 ? '+' : ''}{balance} ★
          </span>
        </div>
      </div>
    </aside>
  );
}
