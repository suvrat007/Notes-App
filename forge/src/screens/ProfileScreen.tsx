import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForge } from '../store/useForge';
import RewardList from '../components/RewardList';
import Avatar from '../components/Avatar';
import { rankFor, MAX_LEVEL } from '../engine/rank';
import SettingsPanel from '../components/SettingsPanel';

export default function ProfileScreen() {
  const {
    ready, loadToday, appState, weekBalance,
    rewardViews, createReward, removeReward, redeemReward,
  } = useForge();

  const [name, setName] = useState('');
  const [cost, setCost] = useState(100);

  useEffect(() => { void loadToday(); }, [loadToday]);
  if (!ready) return <div className="screen" data-testid="screen-profile">Loading…</div>;

  const lifetime = appState?.lifetimeStars ?? 0;
  const rank = rankFor(lifetime);
  const views = rewardViews();
  const canAdd = name.trim().length > 0 && cost > 0;

  return (
    <div className="screen" data-testid="screen-profile">
      <h1 className="screen__title">Profile</h1>

      <div className="rankhero">
        <Avatar tier={rank.tier} color={rank.color} level={rank.level} />
        <div className="rankhero__meta">
          <span className="rankhero__title" data-testid="rank-title"
                style={{ color: rank.color }}>{rank.title}</span>
          <span className="rankhero__level num" data-testid="rank-level">
            Level {rank.level}{rank.level >= MAX_LEVEL ? ' · MAX' : ''}
          </span>

          <div className="pbar" data-testid="rank-progress"
               data-pct={Math.round(rank.progress * 100)}>
            <motion.div
              className="pbar__fill"
              style={{ background: rank.color }}
              initial={false}
              animate={{ width: `${rank.progress * 100}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
          <span className="rankhero__next" data-testid="rank-next">
            {rank.nextAt === null
              ? 'Max rank reached'
              : `${rank.toNext} ★ to level ${rank.level + 1}`}
          </span>
        </div>
      </div>

      <div className="profile-grid">
      <div className="profile-col">
      <div className="card">
        <div className="card__row">
          <span className="card__label">Lifetime stars</span>
          <span className="card__val num" data-testid="p-lifetime">{lifetime} ★</span>
        </div>
        <div className="card__row">
          <span className="card__label">Balance this week</span>
          <span className="card__val num" data-testid="p-balance">{weekBalance()} ★</span>
        </div>
      </div>

      <SettingsPanel />
      </div>

      <div className="profile-col">
      <h2 className="sect">Rewards</h2>
      <RewardList
        views={views}
        onRedeem={(id) => void redeemReward(id)}
        onDelete={(id) => void removeReward(id)}
      />
      {views.length === 0 && (
        <p className="empty" data-testid="rewards-empty">
          No rewards yet. Name something worth earning.
        </p>
      )}

      <div className="rewardadd">
        <input className="input" placeholder="Cheesecake" value={name}
               data-testid="reward-name" onChange={(e) => setName(e.target.value)} />
        <input className="input rewardadd__cost" type="number" min={1} value={cost}
               data-testid="reward-cost" onChange={(e) => setCost(Number(e.target.value))} />
        <button className="banner__btn banner__btn--go" disabled={!canAdd}
                data-testid="reward-add"
                onClick={async () => { await createReward(name.trim(), cost); setName(''); }}>
          Add
        </button>
      </div>

      </div>
      </div>
    </div>
  );
}
