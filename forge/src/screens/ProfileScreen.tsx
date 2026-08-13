import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForge } from '../store/useForge';
import RewardList from '../components/RewardList';
import Avatar from '../components/Avatar';
import { rankFor, MAX_LEVEL } from '../engine/rank';
import { DAMAGE_TIERS, rewardCost, suggestDamage, type DamageTier } from '../engine/rewards';
import SettingsPanel from '../components/SettingsPanel';
import { useAuth } from '../store/useAuth';

export default function ProfileScreen() {
  const {
    ready, loadToday, appState, weekBalance,
    rewardViews, createReward, removeReward, redeemReward,
  } = useForge();
  const account = useAuth((s) => s.account);
  const signOut = useAuth((s) => s.signOut);

  const [name, setName] = useState('');
  /*
   * null means "whatever the system reckons from the name". The moment the
   * user picks a tier it sticks, so their choice is never overwritten by the
   * next keystroke.
   */
  const [pick, setPick] = useState<DamageTier | null>(null);
  const damage = pick ?? suggestDamage(name);

  useEffect(() => { void loadToday(); }, [loadToday]);
  if (!ready) return <div className="screen" data-testid="screen-profile">Loading…</div>;

  const lifetime = appState?.lifetimeStars ?? 0;
  const rank = rankFor(lifetime);
  const views = rewardViews();
  const canAdd = name.trim().length > 0;

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

      {/* Whose tracker this is, and the way out. */}
      {account && (
        <div className="account" data-testid="account-row">
          {account.picture
            ? <img className="account__pic" src={account.picture} alt="" referrerPolicy="no-referrer" />
            : <span className="account__pic account__pic--blank" aria-hidden="true" />}
          <span className="account__who">
            <span className="account__name" data-testid="account-name">{account.name}</span>
            <span className="account__email">{account.email}</span>
          </span>
          <button className="mrow__chip" data-testid="sign-out"
                  title="Your habits stay on this device"
                  onClick={() => void signOut()}>Sign out</button>
        </div>
      )}

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
        <button className="banner__btn banner__btn--go" disabled={!canAdd}
                data-testid="reward-add"
                onClick={async () => {
                  await createReward(name.trim(), damage);
                  setName(''); setPick(null);
                }}>
          Add
        </button>
      </div>

      {/* How much this costs, as a share of everything earned. The system
          opens with a guess from the name so nobody has to price a cheesecake
          from first principles; picking any tier overrides it for good. */}
      <div className="tierpick" data-testid="reward-tiers">
        {DAMAGE_TIERS.map((t) => (
          <button key={t.pct} type="button"
                  className={'tierpick__opt' + (damage === t.pct ? ' tierpick__opt--on' : '')}
                  data-testid={`tier-${t.pct}`}
                  aria-pressed={damage === t.pct}
                  title={t.blurb}
                  onClick={() => setPick(t.pct)}>
            <span className="tierpick__pct num">{t.pct}%</span>
            <span className="tierpick__label">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="reward__note" data-testid="tier-preview">
        {name.trim()
          ? `“${name.trim()}” would cost ${rewardCost(lifetime, damage)} ★ right now — ${damage}% of your total.`
          : 'Name it and the cost is worked out as a share of your total.'}
      </p>

      </div>
      </div>
    </div>
  );
}
