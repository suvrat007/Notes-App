import { useState } from 'react';
import type { RewardView } from '../engine/rewards';

type Props = {
  views: RewardView[];
  /** When true, hides locked rewards (Home shows only what's within reach). */
  affordableOnly?: boolean;
  onRedeem: (id: string) => void;
  onDelete?: (id: string) => void;
};

export default function RewardList({ views, affordableOnly, onRedeem, onDelete }: Props) {
  const [confirming, setConfirming] = useState<RewardView | null>(null);
  const shown = affordableOnly ? views.filter((v) => v.affordable) : views;

  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((v) => (
        <div key={v.id}
             className={'reward' + (v.affordable ? ' reward--ok' : '')}
             data-testid={`reward-${v.id}`}
             data-affordable={v.affordable}>
          <span className="reward__name">
            {v.name}
            {v.nudge && (
              <span className="reward__nudge" data-testid={`nudge-${v.id}`}>
                affordable {v.affordableDays}d — treat yourself?
              </span>
            )}
          </span>

          <span className="reward__cost num">{v.cost} ★</span>

          {v.affordable ? (
            <button className="reward__btn" data-testid={`redeem-${v.id}`}
                    onClick={() => setConfirming(v)}>Redeem</button>
          ) : (
            <span className="reward__locked num" data-testid={`locked-${v.id}`}>
              {v.remaining} to go
            </span>
          )}

          {onDelete && (
            <button className="task__del" data-testid={`del-reward-${v.id}`}
                    aria-label={`Delete ${v.name}`}
                    onClick={() => onDelete(v.id)}>✕</button>
          )}
        </div>
      ))}

      {confirming && (
        <div className="modal" data-testid="redeem-confirm" onClick={() => setConfirming(null)}>
          <div className="modal__sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h2 className="modal__title">Redeem</h2>
            </div>
            <div className="modal__body">
              <p style={{ marginTop: 0 }}>
                Redeem <b>{confirming.name}</b> for{' '}
                <b className="num">{confirming.cost} ★</b>?
              </p>
              <p className="reward__note">
                Spends your weekly balance. Your lifetime stars and rank don't change.
              </p>
              <button className="btn btn--primary" data-testid="redeem-yes"
                      onClick={() => { onRedeem(confirming.id); setConfirming(null); }}>
                Redeem
              </button>
              <button className="btn btn--ghost" data-testid="redeem-no"
                      onClick={() => setConfirming(null)}>Not yet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
