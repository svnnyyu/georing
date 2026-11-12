// End of game popup: the score and each ring's answer and how it went (see docs/SPEC.md ->
// End of game). The game is saved to history as it finishes (GameProvider).

import { useMemo } from 'react';
import { toRecord } from '../../core/history.ts';
import type { GameState } from '../../core/types.ts';
import { GameSummary } from '../components/GameSummary.tsx';
import { Modal } from '../components/Modal.tsx';
import { useGame } from '../state/GameProvider.tsx';

export function SummaryDialog({ game, onHistory }: { game: GameState; onHistory: () => void }) {
  const { start, quit } = useGame();
  const record = useMemo(() => toRecord(game), [game]);

  return (
    <Modal kicker="GeoRing" title="Game over">
      <GameSummary record={record} />
      <div className="dialog-actions three">
        <button type="button" className="btn primary" onClick={() => start()}>
          Play again
        </button>
        <button type="button" className="btn" onClick={quit}>
          Main menu
        </button>
        <button type="button" className="btn" onClick={onHistory}>
          History
        </button>
      </div>
    </Modal>
  );
}
