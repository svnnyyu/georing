// The guess box (see docs/SPEC.md -> Guess matching).
//
// Guessing always takes two steps: first the box is filled with a city's display name (and
// that city is remembered, with its place shown in grey inside the box), then Enter guesses
// it. Typing an exact name skips the first step.
// - Dropdown off (default): Enter resolves the text. A typo, alias or (in Metro mode) a member
//   city is replaced by the resolved name, like Krillion. Same-named cities of similar size
//   open a small picker.
// - Dropdown on: up to 6 suggestions while typing; clicking one, or arrows + Enter, fills the
//   box. Enter with none highlighted fills the top suggestion.

import { useMemo, useRef, useState } from 'react';
import { enterGuess, normalize, suggestions as findSuggestions, type MatchContext } from '../../core/matching.ts';
import { placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

export function GuessInput({ inRing, onGuess }: { inRing: Set<number>; onGuess: (cityId: number) => void }) {
  const { data, index: cityIndex, countryIndex, game, settings } = useGame();
  const regions = settings.subdivisions;
  // Countries mode matches country names (and guesses countries, never metros).
  const countries = game?.settings.mode === 'countries';
  const index = countries ? countryIndex : cityIndex;
  const measure = countries ? 'city' : (game?.settings.measure ?? 'city');
  const dropdown = game?.settings.suggestions ?? false;
  const [text, setText] = useState('');
  /** The city the box currently names (after picking or autocorrecting). */
  const [chosen, setChosen] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picker, setPicker] = useState<number[] | null>(null);
  /** Suggestions show while typing, and close once one is chosen. */
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx: MatchContext = useMemo(() => ({ measure, inRing: (id) => inRing.has(id) }), [measure, inRing]);
  const found = dropdown && open && !picker ? findSuggestions(index, data, text, measure) : [];
  // Metro mode: the member city a suggestion was found through ("via Buena Park").
  const via = new Map(found.map((s) => [s.unitId, s.viaCityId]));
  const list = picker ?? found.map((s) => s.unitId);
  const chosenCity = chosen === null ? undefined : data.byId.get(chosen);
  const showsChosen = chosenCity !== undefined && normalize(text) === normalize(chosenCity.name);

  const reset = () => {
    setNote(null);
    setPicker(null);
    setActive(-1);
  };

  /** Fill the box with a city's name; the next Enter guesses it. */
  const choose = (cityId: number) => {
    setText(data.byId.get(cityId)?.name ?? '');
    setChosen(cityId);
    setOpen(false);
    reset();
    inputRef.current?.focus();
  };

  const submit = (cityId: number) => {
    onGuess(cityId);
    setText('');
    setChosen(null);
    setOpen(true);
    reset();
    inputRef.current?.focus();
  };

  const onEnter = () => {
    if (list.length > 0) {
      choose(list[Math.max(0, active)]!);
      return;
    }
    if (showsChosen) {
      submit(chosen!);
      return;
    }
    if (!text.trim()) return;
    const action = enterGuess(index, data, text, ctx);
    switch (action.kind) {
      case 'notFound':
        setNote(countries ? 'Country not found' : 'City not found');
        break;
      case 'correct':
        choose(action.unitId);
        break;
      case 'submit':
        submit(action.unitId);
        break;
      case 'pick':
        setPicker(action.unitIds);
        setActive(-1);
        break;
    }
  };

  return (
    <div>
      <div className="guess-box">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter();
          }}
        >
          <div className="input-wrap">
            <input
              ref={inputRef}
              className="input"
              placeholder={countries ? 'Type a country' : 'Type a city'}
              value={text}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label="Your guess"
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
                reset();
              }}
              onKeyDown={(e) => {
                if (list.length === 0) return;
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, list.length - 1));
                else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                else if (e.key === 'Escape') {
                  setPicker(null);
                  setOpen(false);
                } else return;
                e.preventDefault();
              }}
            />
            {showsChosen && (
              // An invisible copy of the text pushes the place to just after the name.
              <span className="input-context" aria-hidden="true">
                <span className="mirror">{text}</span>
                <span className="ctx">{placeOf(data, chosen!, { list: true, regions })}</span>
              </span>
            )}
          </div>
          {/* The guess's result makes the sound. */}
          <button type="submit" className="btn" data-sound="none">
            Guess
          </button>
        </form>
        {list.length > 0 && (
          <ul className="list" role="listbox">
            {list.map((id, i) => {
              const c = data.byId.get(id)!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={i === active ? 'list-item active' : 'list-item'}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(id)}
                  >
                    <span>{c.name}</span>
                    <span className="dim">
                      {via.get(id) ? `via ${data.byId.get(via.get(id)!)?.name} · ` : ''}
                      {placeOf(data, id, { list: true, regions })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {note && <div className="message info">{note}</div>}
    </div>
  );
}
