// Search box for picking a specific start city on the setup screen.

import { useState } from 'react';
import { suggest } from '../../core/matching.ts';
import { placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

export function CitySearch({ onPick }: { onPick: (cityId: number) => void }) {
  const { data, index, settings } = useGame();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const results = suggest(index, data, text, 'city');

  const pick = (id: number) => {
    onPick(id);
    setText('');
  };

  return (
    <div className="guess-box">
      <input
        className="input"
        placeholder="Search for a city"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active] !== undefined) pick(results[active]!);
          else return;
          e.preventDefault();
        }}
        aria-label="Start city"
      />
      {results.length > 0 && (
        <ul className="list" role="listbox">
          {results.map((id, i) => {
            const c = data.byId.get(id)!;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={i === active ? 'list-item active' : 'list-item'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(id)}
                >
                  <span>{c.name}</span>
                  <span className="dim">{placeOf(data, id, { list: true, regions: settings.subdivisions })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
