# Ring City Game

A browser geography game: guess the most populous city inside rings drawn around a start city on a zoomable globe.

**The source of truth is [docs/SPEC.md](docs/SPEC.md). Read it before making changes.** Build in its milestone order (Build order section), finish and check each milestone before starting the next, and update the spec when a decision changes. Items under "Open decisions" are asked about, not guessed. Visual references (Krillion, Eraly) are in `docs/reference/`.

## Code-structure rules

- **Core logic is separate from UI.** `src/core/` is pure TypeScript game logic: no DOM, no React, no `window`/`localStorage`/`fetch`. `src/ui/` may import from `core`; `core` never imports from `ui`, React or the browser. Storage is passed into `core/history.ts`, not reached for directly.
- **One state object.** The game is one plain object. Actions in `core/game.ts` (`submitGuess`, `useHint`, `nextRing`, …) take a state and return a new one. The UI holds it in one place (`ui/state/GameProvider.tsx`, a `useReducer`) and redraws from it.
- **All tunable numbers in `src/config.ts`** (ring cap, slider ranges, hint settings, fuzzy thresholds, population cutoffs, storage keys). Never hard-code a tunable number elsewhere.
- **All colours, fonts and spacing in `src/ui/theme/tokens.css`** as CSS variables. No colour values anywhere else; the canvas globe renderer reads its colours from these variables too.
- **Seeded randomness.** Start-city picks and hint offsets use `core/random.ts` with a seed saved per game, never `Math.random()`.
- **Tests.** Every `src/core/` module has a unit test in `tests/core/`.
- **Data pipeline** lives in `pipeline/` (Python, run by hand) and writes static files to `public/data/`. `pipeline/raw/` is git-ignored.
- The globe is a d3-geo canvas inside one React component under `src/ui/globe/`; React doesn't re-render the map itself.

## Commands

- `npm install` — install dependencies (after cloning or when `package.json` changes)
- `npm run dev` — dev server at http://localhost:5173
- `npm test` — run unit tests once (`npm run test:watch` to re-run on save)
- `npm run typecheck` — TypeScript check
- `npm run build` — production build into `dist/`
- `npm run data` — rebuild `public/data/` from GeoNames + Natural Earth (downloads ~220 MB into `pipeline/raw/` on first run; stdlib Python 3 + mapshaper)

## User context

The project owner is new to web development: briefly explain anything they need to install or run themselves.
