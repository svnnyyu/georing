// "Share results": on a phone, the system share sheet; elsewhere, copies the text (see
// core/share.ts) and says so on the button for a moment.

import { useEffect, useRef, useState } from 'react';
import { SHARE_COPIED_MS } from '../../config.ts';
import type { GameRecord } from '../../core/history.ts';
import { shareText } from '../../core/share.ts';
import { useGame } from '../state/GameProvider.tsx';

type State = 'idle' | 'copied' | 'failed';

export function ShareButton({ record, className = 'btn' }: { record: GameRecord; className?: string }) {
  const { data } = useGame();
  const [state, setState] = useState<State>('idle');
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (s: State) => {
    setState(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), SHARE_COPIED_MS);
  };

  const share = async () => {
    const text = shareText(record, { startName: data.byId.get(record.startId)?.name });
    // The share sheet suits phones; on a computer, copying is what people expect.
    const phone = window.matchMedia?.('(pointer: coarse)').matches;
    if (phone && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flash('copied');
    } catch {
      flash(copyWithTextarea(text) ? 'copied' : 'failed');
    }
  };

  return (
    <button type="button" className={className} onClick={() => void share()} aria-live="polite">
      {state === 'copied' ? 'Copied!' : state === 'failed' ? "Couldn't copy" : 'Share results'}
    </button>
  );
}

/** The older way to copy, for browsers that refuse the clipboard API (no focus, older
 *  Safari): select the text in a hidden text box and copy it. */
function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
