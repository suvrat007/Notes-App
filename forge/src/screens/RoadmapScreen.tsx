import { useEffect } from 'react';
import { useForge } from '../store/useForge';
import { weeklyGoalStars } from '../engine/targets';
import { IconFlag } from '../components/icons';

export default function RoadmapScreen() {
  const { ready, habits, loadToday, roadmap, weekBalance, weekProjection } = useForge();

  useEffect(() => { void loadToday(); }, [loadToday]);
  if (!ready) return <div className="screen" data-testid="screen-roadmap">Loading…</div>;

  const nodes = roadmap();
  const balance = weekBalance();
  const goal = weeklyGoalStars(
    nodes,
    (id) => habits.find((h) => h.id === id)?.starsPerRep ?? 0,
  );
  const projection = weekProjection();
  const endFill = goal > 0 ? Math.max(0, Math.min(1, balance / goal)) : 0;

  return (
    <div className="screen" data-testid="screen-roadmap">
      <h1 className="screen__title">Roadmap</h1>

      {nodes.length === 0 ? (
        <p className="empty" data-testid="roadmap-empty">
          No weekly targets yet. Give a good habit a weekly target to see your track.
        </p>
      ) : (
        <>
          <div className="track" data-testid="roadmap-track">
            {nodes.map((n) => (
              <div className="track__node" key={n.habitId}
                   data-testid={`node-${n.habitId}`}
                   data-fill={Math.round(n.fill * 100)}>
                <div className="node__dial">
                  {/* conic-gradient fill is cheap and animates smoothly */}
                  <div className="node__fill"
                       style={{ background:
                         `conic-gradient(var(--accent) ${n.fill * 360}deg, var(--steel) 0deg)` }} />
                  <span className="node__icon" aria-hidden="true">{n.icon}</span>
                </div>
                <span className="node__name">{n.name}</span>
                <span className="node__reps num">
                  {n.done}/{n.target}
                  <span className="node__per">/{n.periodShort}</span>
                </span>
                {n.fill < 1 && (
                  <span className={'node__pace' + (n.aheadBy < 0 ? ' node__pace--behind' : '')}>
                    {n.aheadBy >= 0 ? `+${n.aheadBy} ahead` : `${Math.abs(n.aheadBy)} behind`}
                  </span>
                )}
              </div>
            ))}

            <div className="track__node track__node--end" data-testid="node-end"
                 data-fill={Math.round(endFill * 100)}>
              <div className="node__dial node__dial--end">
                <div className="node__fill"
                     style={{ background:
                       `conic-gradient(var(--good) ${endFill * 360}deg, var(--steel) 0deg)` }} />
                <span className="node__icon"><IconFlag size={22} /></span>
              </div>
              <span className="node__name">Week</span>
              <span className="node__reps num">{balance}/{goal}</span>
            </div>
          </div>

          <div className="card">
            <div className="card__row">
              <span className="card__label">Balance this week</span>
              <span className={'card__val num' + (balance < 0 ? ' stat__value--neg' : '')}
                    data-testid="rm-balance">{balance} ★</span>
            </div>
            <div className="card__row">
              <span className="card__label">Week goal (all goals, per week)</span>
              <span className="card__val num" data-testid="rm-goal">{goal} ★</span>
            </div>
            <div className="card__row">
              <span className="card__label">Projected finish at this pace</span>
              <span className="card__val num" data-testid="rm-projection">{projection} ★</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
