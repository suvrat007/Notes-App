import { useState } from 'react';

type Props = {
  suggested: number;
  onAccept: (value: number) => void;
};

/** Shown once a day until the user accepts (or adjusts) today's target. */
export default function TargetBanner({ suggested, onAccept }: Props) {
  const [adjusting, setAdjusting] = useState(false);
  const [value, setValue] = useState(suggested);

  if (adjusting) {
    return (
      <div className="banner" data-testid="target-banner">
        <div className="banner__row">
          <span className="banner__text">Today's target</span>
          <input
            className="input banner__input num"
            type="number"
            min={0}
            value={value}
            data-testid="target-input"
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <button className="banner__btn banner__btn--go"
                  data-testid="target-confirm"
                  onClick={() => onAccept(value)}>Set</button>
        </div>
      </div>
    );
  }

  return (
    <div className="banner" data-testid="target-banner">
      <div className="banner__row">
        <span className="banner__text">
          Today's target: <b className="num" data-testid="target-suggested">{suggested}</b> ★
        </span>
        <button className="banner__btn" data-testid="target-adjust"
                onClick={() => setAdjusting(true)}>Adjust</button>
        <button className="banner__btn banner__btn--go" data-testid="target-accept"
                onClick={() => onAccept(suggested)}>OK</button>
      </div>
    </div>
  );
}
