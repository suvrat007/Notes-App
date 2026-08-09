import type { ScreenKey } from '../screens/registry';
import { SCREENS } from '../screens/registry';

type Props = {
  active: ScreenKey;
  onChange: (key: ScreenKey) => void;
};

/**
 * Bottom tab bar — the mobile navigation. Hidden at desktop widths, where
 * `Sidebar` takes over. Tap targets are >= 48px tall per the shell spec.
 */
export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar no-select" aria-label="Primary">
      {SCREENS.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            className={'tab' + (isActive ? ' tab--active' : '')}
            onClick={() => onChange(key)}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`tab-${key}`}
          >
            <span className="tab__icon">
              <Icon />
            </span>
            <span className="tab__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
