import type { ScreenKey } from '../screens/registry';
import { SCREENS } from '../screens/registry';

type Props = {
  active: ScreenKey;
  onChange: (key: ScreenKey) => void;
};

/** Bottom tab bar. Tap targets are >= 48px tall per the shell spec. */
export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar no-select" aria-label="Primary">
      {SCREENS.map((s) => {
        const isActive = s.key === active;
        return (
          <button
            key={s.key}
            className={'tab' + (isActive ? ' tab--active' : '')}
            onClick={() => onChange(s.key)}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`tab-${s.key}`}
          >
            <span className="tab__icon" aria-hidden="true">
              {s.icon}
            </span>
            <span className="tab__label">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
