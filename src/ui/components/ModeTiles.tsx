// The game mode choice, Cities or Countries: on the start screen (above Start game) and at the
// top of Settings. Saved with the other settings; applies to the next game.

import type { GameMode } from '../../core/types.ts';
import { useGame } from '../state/GameProvider.tsx';
import { Tiles } from './Controls.tsx';

export function ModeTiles() {
  const { settings, setSettings } = useGame();
  return (
    <Tiles<GameMode>
      label="Game mode"
      options={[
        { value: 'cities', label: 'Cities' },
        { value: 'countries', label: 'Countries' },
      ]}
      value={settings.mode}
      onChange={(mode) => setSettings({ ...settings, mode })}
    />
  );
}
