// A centred popup over a dimmed page (menu, settings, summary). Escape or a click on the
// dimmed area closes it, when onClose is given.

import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './Icons.tsx';

export function Modal({
  kicker,
  title,
  onClose,
  children,
  wide = false,
}: {
  kicker?: string;
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2 className="dialog-title glitch">{title}</h2>
          </div>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          )}
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
