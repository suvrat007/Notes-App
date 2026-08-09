import { useEffect, useState } from 'react';
import { useForge } from '../store/useForge';
import RewardList from '../components/RewardList';

export default function ProfileScreen() {
  const {
    ready, loadToday, appState, weekBalance,
    rewardViews, createReward, removeReward, redeemReward,
  } = useForge();

  const [name, setName] = useState('');
  const [cost, setCost] = useState(100);

  useEffect(() => { void loadToday(); }, [loadToday]);
  if (!ready) return <div className="screen" data-testid="screen-profile">Loading…</div>;

  const views = rewardViews();
  const canAdd = name.trim().length > 0 && cost > 0;

  return (
    <div className="screen" data-testid="screen-profile">
      <h1 className="screen__title">Profile</h1>

      <div className="card">
        <div className="card__row">
          <span className="card__label">Lifetime stars</span>
          <span className="card__val num" data-testid="p-lifetime">
            {appState?.lifetimeStars ?? 0} ★
          </span>
        </div>
        <div className="card__row">
          <span className="card__label">Balance this week</span>
          <span className="card__val num" data-testid="p-balance">{weekBalance()} ★</span>
        </div>
      </div>

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
                onClick={async () => {
                  await createReward(name.trim(), cost);
                  setName('');
                }}>Add</button>
      </div>
    </div>
  );
}
