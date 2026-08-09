import type { ReactNode } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
};

/** Bottom-sheet modal. Backdrop closes; the sheet itself swallows clicks. */
export default function Modal({ title, onClose, children, testId }: Props) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}
         onClick={onClose} data-testid={testId}>
      <div className="modal__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close"
                  data-testid="modal-close">✕</button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
