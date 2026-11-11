# Ring City Game — Build Spec

Nov 11, 2026 · Sunny Yu

## Overview

A browser game played on a zoomable globe: a start city is chosen, a ring is drawn around it, and the player guesses the most populous city inside that ring. Each new ring sits further out than the last. The first ring is a full circle; every later ring is a donut between two radii.

This is a free-to-play hobby prototype, global (not US-only), with no accounts, no server and no scoring yet. It must be replayable with unlimited games and keep a local history of past games.

**For Claude Code:** treat this doc as the source of truth. It lives at `docs/SPEC.md` and is referenced from `CLAUDE.md`. Build in the milestone order under Build order, keep the logic/UI separation described under Code structure, and update this spec when a decision changes. Items under Open decisions should be asked about, not guessed.

## Game rules

Every ring in a game has the same width, set by the player, and the target in each ring is its most populous eligible city. All distances are in kilometres, measured as great-circle (haversine) distance from the start city, Earth radius 6,371 km.

### Settings (chosen before each game)

| Setting | Options | Default |
| --- | --- | --- |
| Start city | Random from the well-known pool, or search and pick any city | Random |
| Ring width | Slider, 50–300 km in steps of 50 | 100 km |
| Number of rings | Slider, 1–10 | 3 |
| Guesses per ring | Slider, 3–5 | 4 |
| Suggestions dropdown | On / Off (see Guess matching) | Off |
| Mode | Population (now); Density (later, shown disabled) | Population |

### Ring geometry

- Each city is a single point: its GeoNames latitude and longitude, usually the historic centre or main square, not a computed middle of its area.
- A city is in a ring only if its point is. Distance is the great-circle distance from the start city's point to that point; area overlap doesn't matter.
- Width `w` is constant for the whole game. Ring `k` covers distances from `(k−1)·w` to `k·w`, so every ring is full width.
- Ring 1 is a full circle of radius `w`, and the start city itself is excluded from it.
- A city belongs to ring `k` when `inner < d ≤ outer`, so no city is ever in two rings.
- A game has at most 10 rings (`RING_CAP` in `config.ts`), so the furthest a game reaches is 10 × `w`: 500 km at the narrowest width, 3,000 km at the widest.
- Example: `w` = 200 km with 4 rings gives 0–200, 200–400, 400–600 and 600–800 km.

### Eligible cities and the answer

- Eligible = in the game's city list (population ≥ 15,000, cleaned as described under Data) and inside the ring.
- The answer is the eligible city with the highest population in the ring.
- An empty ring (all ocean, for example) shows "No cities in this ring" and advances automatically. It is recorded as empty, not as a miss.
- Random start cities are drawn from the well-known pool: population ≥ 500,000 or a national capital.

### Guessing

1. The globe flies to the start city and draws ring 1.
2. The player types a guess. Typos, accents and abbreviations are corrected automatically, and a suggestions dropdown can be turned on in settings; see Guess matching.
3. A guess outside the current ring places a yellow marker on that city and shows "Not in this ring". It does not use a guess. A repeated guess is ignored.
4. A wrong guess inside the ring places a red marker on that city, labelled with its name.
5. A correct guess places a green marker and ends the ring as solved.
6. When guesses run out, the answer is revealed with a green marker and the ring ends as missed.
7. After each ring, a reveal panel lists the ring's top 5 cities by population, with the player's guesses marked. A Next ring button then zooms the camera out to fit the next ring.
8. Markers from earlier rings stay on the globe, faded.

### Guess info card

Hovering over any guessed city's marker (tapping on phones) shows a small card:

- Name, state or province, and country. Flags come later.
- Population.
- Rank in the ring, written as "#2 of 14" (2nd most populous of the 14 cities in this ring).
- For a yellow (outside) guess, distance instead of rank, for example "120 km outside".

All of this shows as soon as a city is guessed. A difficulty setting that hides some of it is planned for later.

### Hints (3 per ring)

Hints unlock in a fixed order, each usable once per ring. They do not cost guesses (there is no scoring yet), but hint use is recorded in history.

1. **Country:** the answer's country is outlined and tinted, and its name is shown.
2. **Area circle:** a circle that contains the answer is drawn. Its centre is offset from the answer in a random direction by up to half its radius, so the answer is never simply in the middle. Its radius starts at 25% of the ring width and shrinks until it holds at most 5 eligible cities, with a minimum of 10 km. Dense regions therefore get a tighter circle.
3. **First letter:** shows "Starts with T", using the first letter of the city's display name.

### End of game

A summary screen shows each ring's answer, whether it was solved (and in how many guesses) or missed, and the hints used. The game is saved to history. Buttons: Play again with the same settings, New game, and History.

## Data

City data comes from GeoNames (city-proper populations), map shapes come from Natural Earth, and a one-time script turns both into small static files shipped with the site. The game makes no network calls for data at runtime beyond loading its own files.

### Sources

| Dataset | Used for | Files | License |
| --- | --- | --- | --- |
| [GeoNames](https://download.geonames.org/export/dump/) | Cities, populations, coordinates, alternate names | `cities15000.zip`, `countryInfo.txt`, `admin1CodesASCII.txt` | CC BY 4.0, attribution required |
| [Natural Earth](https://www.naturalearthdata.com/downloads/) | Land, coastlines, country borders, lakes | Admin 0 countries + land at 1:110m, 1:50m, 1:10m | Public domain |
| [GHSL](https://human-settlement.emergency.copernicus.eu/download.php) | Density mode and population-fix reference (later) | Urban Centre Database R2024A | Free with citation |

### Pipeline (`pipeline/build_cities.py`, run by hand, not at runtime)

1. Download the raw files into `pipeline/raw/`, which is git-ignored.
2. Keep populated places (feature class `P`) with population ≥ 15,000. Drop feature codes `PPLX` (city sections), `PPLH` (historical), `PPLQ` (abandoned), `PPLW` (destroyed) and `PPLCH` (historical capital).
3. Fix Chinese populations with `pipeline/china_urban_2020.csv` (2020 census urban-area figures, matched by name + province; sources noted in the file). Chinese cities above 750,000 that are on neither source list are capped at 750,000 (`CN_UNLISTED_CAP`), since the source lists every city above that. Then apply `pipeline/overrides.csv` (columns: geonameid, field, value, note), which wins over everything else. This fixes bad populations and removes entries, each with a note on why.
4. Build aliases from GeoNames `alternateNamesV2.zip` (it has language tags, unlike the column in `cities15000`). Keep Latin-script names starting with a capital (or tagged `abbr`), deduplicated after normalization, at most 10 per city, ranked: English, abbreviations, the country's own languages, major European languages (fr, de, es, pt, it, nl), then at most 3 untagged names. Other languages are skipped because they are mostly transliterations. Then merge `pipeline/aliases_extra.csv` for abbreviations GeoNames lacks (most, such as NYC, LA, SF, KL, HCMC and CDMX, are already there; DC was added).
5. Flag well-known cities: population ≥ 500,000, or feature code `PPLC` (national capital).
6. Write `public/data/cities.json` and `public/data/countries.json` (country code → display name + aliases, such as Turkey/Türkiye).
7. `pipeline/build_geo.py` converts the Natural Earth layers to quantized TopoJSON with [mapshaper](https://github.com/mbloch/mapshaper) (an npm dev dependency): `world-110m.json` (land, countries) and `world-50m.json` (land, countries, lakes) in `public/data/geo/`. Countries keep `cc` (from `ISO_A2_EH`) and `name`. `npm run data` runs both scripts.
8. Print a sanity report: total city count, the 25 most populous cities, every city above 10 million, and the ring answers for a few test start cities (New York, London, Tokyo, Lagos, Chongqing).

### City record (in `cities.json`)

| Field | Meaning |
| --- | --- |
| `id` | GeoNames id |
| `name` | Display name, for example "São Paulo" |
| `ascii` | ASCII name, for example "Sao Paulo" |
| `lat`, `lon` | Coordinates in degrees |
| `pop` | Population |
| `cc` | ISO 3166 two-letter country code |
| `admin1` | State or province name, shown to tell duplicate names apart |
| `aliases` | Alternate names and abbreviations |
| `wellKnown` | True if in the random start-city pool |

Expect roughly 25,000–30,000 cities and a file of a few MB, which compresses well and is fine to load once.

### Known data issues to handle

- **Oversized Chinese "cities":** many GeoNames populations cover whole prefectures, not just Chongqing (22M in GeoNames, 9.6M urban): Chengdu, Xi'an, Harbin, Weifang and about 180 others. These are replaced with 2020 census urban-area figures from `pipeline/china_urban_2020.csv` (about 290 cities) or capped (about 45; see Open decisions).
- **Boroughs and wards listed as cities:** GeoNames lists some city parts as their own cities. Smaller ones are kept, but parts that showed up as ring answers for the test start cities are removed through `overrides.csv`: New York's five boroughs, all 86 places inside Greater London, Shanghai's 14 urban districts and Shenzhen's Bao'an. If another one shows up as an odd answer in play, remove it the same way.
- **Other whole-district figures:** some non-Chinese cities also use municipality or district totals (Ho Chi Minh City 14M, Lahore 13M, Kinshasa 16M). Accepted for the prototype.
- **Uneven population years:** GeoNames figures come from different census years by country. This is acceptable for a prototype; note it in the credits.
- **Attribution:** an About/Credits screen must credit GeoNames (CC BY 4.0) and Natural Earth, and name the source of the Chinese urban figures (2020 census via citypopulation.de and Wikipedia).

## Guess matching

A guess is resolved to one city by normalizing it, checking exact names and aliases, then falling back to fuzzy matching, so "sao paulo", "NYC" and small typos all work. Matching lives in `src/core/matching.ts` as pure functions with unit tests.

### Steps

1. **Normalize** both the guess and every name: lowercase, strip accents (Unicode NFD, then drop combining marks), turn hyphens and apostrophes into spaces, drop other punctuation, collapse whitespace. "São-Paulo" and "sao paulo" become the same string. Precompute normalized names once at load.
2. **Exact match** on normalized `name`, `ascii` or any alias. Search cities in the current ring first; if there's no hit, search all cities so the game can say "Not in this ring".
3. **Fuzzy match** when nothing matches exactly, using [Fuse.js](https://www.fusejs.io/) or a small Damerau-Levenshtein function (which counts letter insertions, deletions, substitutions and swaps). Accept the best match if its edit distance is ≤ 1 for names of 4–5 letters, ≤ 2 for 6–9 letters, and ≤ 3 for 10 or more. Prefer in-ring candidates.
4. **Ambiguity:** if two cities tie, prefer the in-ring one, then the larger population. If two in-ring cities share a name, the dropdown shows `admin1` and country to tell them apart.

### Suggestions dropdown (setting, off by default)

With the dropdown off, the player types a name and presses Enter, and the steps above resolve it. No list of cities is ever shown while typing. The only exception is a guess that matches two or more cities equally (for example "Springfield"): then a small picker lists just those cities with state and country.

With the dropdown on:

- It appears after 2 typed characters and shows up to 6 suggestions from all cities worldwide, ranked by prefix match, then fuzzy score, then population.
- Ranking never uses ring membership, so the list gives no clue about which cities are in the ring.
- Each suggestion shows the name plus state and country. Arrow keys and Enter select; Enter with no selection submits the top suggestion.
- The dropdown never shows populations.

In both cases, a guess that can't be matched to any city shows "City not found" and doesn't use a guess.

## Globe

The globe is drawn by hand with [d3-geo](https://d3js.org/d3-geo) (orthographic projection) on an HTML canvas, which gives full control over the look. It should feel like a stripped-down Apple Maps: land, water, coastlines and borders, with no labels except the game's own markers.

### Interaction

- Drag to rotate (versor dragging, so the globe turns naturally at any angle). Scroll or pinch to zoom, from the whole Earth down to about a 100 km wide view.
- Smooth camera moves: fly to the start city at game start, then zoom out to fit each new ring with its outer edge at about 80% of the shorter screen side.
- Works with mouse and touch.

### Layers (bottom to top)

1. Ocean: the sphere filled with the ocean colour, plus a faint graticule (10° lines).
2. Land fill.
3. Lakes (only when zoomed in).
4. Country borders: hidden on the whole-Earth view, fading in as the player zooms.
5. Hint country highlight (outline + tint).
6. Current ring: a donut filled with a translucent accent and stroked on both edges. Ring 1 is a filled circle. Earlier rings are drawn as faint outlines only.
7. Hint area circle (dashed).
8. Markers: start city, guesses, correct answer.

### Detail levels

Use Natural Earth 1:110m when the whole globe is visible and switch to 1:50m when zoomed in. Load 1:10m lazily, and only if 1:50m looks too coarse at close zoom. Join countries to cities by the `ISO_A2_EH` field: the plain `ISO_A2` field has `-99` for a few countries (France and Norway among them).

### Drawing rings

Build each ring edge with `d3.geoCircle()` centred on the start city, radius in degrees = km ÷ 6,371 × 180 ÷ π. Draw the outer and inner circles in one path with the even-odd fill rule to get the donut. Geodesic circles stay correct near the poles and across the date line, where flat circles would distort.

### Markers

Markers are small pixel-style squares about 8 px, with a 1 px dark outline and a short pixel-font label:

- Start city: accent diamond.
- Guess outside the ring: yellow square.
- Wrong guess: red square.
- Correct or revealed answer: green square with a soft glow pulse when it appears.
- Every guessed marker opens the guess info card on hover or tap.

### Pixel-globe option

Add a setting that renders the globe to an offscreen canvas at half resolution and scales it up with `image-rendering: pixelated`. This lets us compare a crisp globe against a pixelated one and keep whichever looks better.

**Fallback:** if canvas performance is poor at 1:50m on a phone, switch the globe to [MapLibre GL JS](https://maplibre.org/) with its globe projection and a custom minimal style. This change should only touch `src/ui/globe/`.

## Visual style

The target is "modern pixel": a dark navy night-map base, a pixel display font for big moments, a clean monospace for everything else, and a smooth globe framed by crisp pixel UI. The references are Krillion and Eraly. Save their screenshots in `docs/reference/` so Claude Code can look at them.

### Palette

All colours are CSS variables defined once in `src/ui/theme/tokens.css`. No colour values anywhere else.

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | #0A0F1C | Page background |
| `--surface` | #111A2E | Panels, menu tiles, info card |
| `--border` | #2A3A5C | Panel and button borders, dashed rules |
| `--text` | #E6ECF5 | Main text |
| `--text-dim` | #8090AD | Labels, secondary text |
| `--ocean` | #0D1830 | Globe water |
| `--land` | #1F2C45 | Globe land |
| `--coast` | #3B5278 | Coastlines |
| `--country-line` | #33466A | Country borders |
| `--accent` | #5FD4E6 | UI accent (cyan): focus, selected tiles, links, start-city diamond |
| `--ring` | #5FD4E6 | Ring stroke (same cyan); fill at 15% opacity |
| `--hint` | #C792EA | Hint circle and hint country outline |
| `--correct` | #5FE08A | Correct answer marker and text |
| `--wrong` | #FF5C6C | Wrong guess marker and text |
| `--outside` | #F5D547 | Outside-the-ring guess marker and text |

Green, red and yellow are kept only for guess results, so the ring uses the cyan accent and hints use lilac.

### Type

- Display: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) or [Silkscreen](https://fonts.google.com/specimen/Silkscreen) for the title, ring number and summary numbers. Pick whichever reads better at large sizes.
- Body: [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) for inputs, lists and body text.
- Section labels: uppercase, letter-spacing 0.2em, `--text-dim`, followed by a dashed rule (like "DIVE LOG" in Krillion).

### Components

- Buttons and tiles: square corners, 2 px `--border` outline, `--surface` fill. The selected state switches to an `--accent` outline and text. Same look as Krillion's menu grid.
- Title: pixel font with a subtle RGB-split glitch (two offset text shadows in pink and cyan).
- Scanline overlay over the whole page at about 4% opacity. The pixel-globe option sits on top of the same idea.
- Guess input: full-width monospace field with a blinking block cursor. The dropdown (when on) is styled as a bordered panel list.
- Guess log per ring: rows like Eraly's time log, showing guess name and a yellow, red or green square, plus the revealed population after the ring ends.
- Pixel icons (menu, settings, sound, history, hint) drawn as small SVGs on a pixel grid.
- Motion: UI transitions use stepped easing (`steps()`) for a pixel feel. Camera moves on the globe stay smooth.

### Layout

- Desktop: the globe fills the screen, with a side panel on the right holding ring info, guess input, guess log and hint buttons.
- Phone: the globe fills the top 60%; the panel becomes a bottom sheet.
- The menu button sits top-left and opens a tile grid: New game, History, Settings, About/Credits.

## Code structure

The code is split in three: game logic in `src/core/`, everything visual in `src/ui/`, and data preparation in `pipeline/`. The logic never touches the screen, so it can be tested on its own and the UI can be restyled or rebuilt without breaking the game.

How the parts connect:

- `pipeline/` (Python, run by hand) writes static files to `public/data/` (cities, countries, map shapes).
- `src/data/loadData.ts` fetches and indexes those files once at startup and hands them to `core/`.
- `src/ui/` calls actions in `core/`, which return a new game state; the UI redraws from that state. `core/` never depends on the UI.
- `src/ui/theme/tokens.css` holds every colour, font and spacing value; `src/config.ts` holds every tunable number.

### Stack

- [Vite](https://vite.dev/) + TypeScript for the site, building to static files.
- [React](https://react.dev/) for UI components.
- d3-geo + d3-zoom for the globe, drawn on a canvas inside one React component. React does not re-render the map itself.
- Fuse.js (or a small function) for fuzzy matching.
- [Vitest](https://vitest.dev/) for unit tests on `src/core/`.
- Python 3 for the data pipeline.
- GitHub Pages for hosting, deployed by a GitHub Actions workflow.

### Folder layout

```
ring-city-game/
├── CLAUDE.md                 short rules for Claude Code + pointer to docs/SPEC.md
├── docs/
│   ├── SPEC.md               this document
│   └── reference/            Krillion / Eraly screenshots
├── pipeline/                 Python, run by hand
│   ├── build_cities.py
│   ├── build_geo.py
│   ├── overrides.csv
│   ├── aliases_extra.csv
│   ├── china_urban_2020.csv  census urban figures for Chinese cities
│   └── raw/                  downloads (git-ignored)
├── public/data/              pipeline output (committed)
│   ├── cities.json
│   ├── countries.json
│   └── geo/                  TopoJSON at 110m / 50m
├── src/
│   ├── config.ts             every tunable number
│   ├── core/                 game logic: no DOM, no React
│   │   ├── types.ts
│   │   ├── geo.ts            haversine, ring membership
│   │   ├── rings.ts          ring list + answers from settings
│   │   ├── game.ts           game state + actions
│   │   ├── matching.ts       normalize, aliases, fuzzy
│   │   ├── hints.ts          country, area circle, first letter
│   │   ├── guessInfo.ts      info card contents (population, rank)
│   │   ├── random.ts         seeded random numbers
│   │   └── history.ts        save / load games
│   ├── data/loadData.ts      fetch + index the JSON files
│   ├── ui/
│   │   ├── theme/            tokens.css, base.css, fonts
│   │   ├── globe/            GlobeView.tsx, renderer, camera, layers
│   │   ├── screens/          Setup, Play, Summary, History, About
│   │   ├── components/       Button, Tile, Slider, GuessInput, GuessLog,
│   │   │                     HintBar, InfoCard, Menu
│   │   └── state/            GameProvider.tsx (useReducer around core/game.ts)
│   ├── App.tsx
│   └── main.tsx
└── tests/core/               one test file per core module
```

### Rules for keeping it organized

- **One-way dependency:** `ui` may import from `core`; `core` never imports from `ui`, React or the browser. Storage is passed into `history.ts`, not reached for directly.
- **One state object:** the game is a single plain object (settings, rings, current ring, guesses, hints used). Actions in `game.ts` such as `submitGuess`, `useHint` and `nextRing` take a state and return a new one. The UI holds it in one place (`ui/state/GameProvider.tsx`, a `useReducer` that calls those actions) and redraws from it.
- **One place for numbers:** `src/config.ts` holds the ring cap, slider ranges, hint settings, fuzzy thresholds and the well-known cutoff. Nothing tunable is hard-coded elsewhere.
- **One place for looks:** colours, fonts, sizes and spacing live in `src/ui/theme/tokens.css`. The globe renderer reads its colours from those CSS variables too.
- **Seeded randomness:** start-city picks and hint offsets use a seeded random generator. The seed is saved with each game so any game can be replayed exactly when debugging.
- **Tests:** every core module gets unit tests (ring membership at boundaries, answers for known start cities, typo and alias matching, hint circle always containing the answer).

## History, settings and storage

Everything is saved in the browser's local storage, so there are no accounts and no server; history stays on the device it was played on.

### Saved game record

One record per finished game (abandoned games are not saved):

- Date and time, seed, start city id, mode, ring width, number of rings, guesses per ring.
- Per ring: inner and outer radius, answer city id, guesses in order (city ids), solved / missed / empty, hints used.

### History screen

- A list of past games, newest first: date, start city, ring width × rings, and a row of small squares per ring (green solved, red missed, grey empty).
- Tapping a game opens its summary and offers "Replay this game", which reuses the seed and settings.
- Simple totals at the top: games played and rings solved %.
- A "Clear history" button with a confirmation step.

### Storage rules

- Keys are versioned (`ringgame.v1.history`, `ringgame.v1.settings`) so the format can change later without breaking old saves.
- The last-used settings are remembered as the defaults for the next game.
- Every read and write is wrapped in try/catch. If storage is unavailable (private browsing, for example), the game still plays and history simply isn't kept.
- History is capped at 500 games, dropping the oldest.

## Build order

Build in this order, finishing and checking each milestone before the next. The game is playable (if plain) at milestone 5; styling comes after the logic is right.

1. **Project setup.** Vite + TypeScript + React, the folder layout above, Vitest, a `CLAUDE.md` pointing to this spec, `.gitignore`, and a GitHub repo. *Done when:* the dev server shows a blank page and an empty test passes.
2. **Data pipeline.** `build_cities.py` and `build_geo.py` produce the files in `public/data/`. *Done when:* the sanity report looks right, Chongqing's population is fixed, and the test start cities give sensible ring answers.
3. **Core logic + tests.** `geo`, `rings`, `matching`, `hints`, `guessInfo`, `random`, `game`, `history`. *Done when:* all core tests pass, including boundary distances, typos ("stvee"-style), accents, aliases (NYC) and the hint circle always containing the answer.
4. **Plain globe.** Ocean, land and borders with drag and zoom, detail switching and fly-to. *Done when:* it runs smoothly on a laptop and a phone.
5. **Game loop.** Setup screen with sliders, ring drawing, guess input with autocorrect and the optional suggestions dropdown, yellow, red and green markers, the guess info card, the reveal panel and Next ring, then the summary screen. *Done when:* a full game plays start to finish.
6. **Hints.** All three, in order, drawn on the globe. *Done when:* each hint shows correctly near the poles, the date line and in a dense region.
7. **History.** Save, list, replay and clear. *Done when:* games survive a page reload.
8. **Styling pass.** Tokens, fonts, tiles, scanlines, glitch title, pixel icons, the pixel-globe option and mobile layout, checked against the reference screenshots.
9. **Deploy.** GitHub Pages via Actions, plus an About/Credits screen with GeoNames and Natural Earth attribution. *Done when:* the public URL works on a phone.

## Later features and open decisions

Density mode is the next planned feature after the prototype.

### Density mode (planned)

Same rings, but the target is the densest city instead of the most populous. GeoNames has no city areas, so density needs another source:

- **Recommended:** GHSL Urban Centre Database, which has population and built-up area for every urban centre with 50,000+ people, measured the same way worldwide. Each GeoNames city inside an urban-centre outline takes that centre's density. Smaller towns are left out of density mode.
- **Alternative:** a population grid (GHSL GHS-POP at 1 km), using the people within a fixed radius of each city point, for example 5 km. It's consistent for every city, but measures the neighbourhood rather than the official city.

The core should allow `mode` to swap the ranking field without other changes, so density is mostly a data task.

### Other later ideas

- Scoring (fewer guesses and hints mean more points), with a score chart on the summary screen like Krillion's and Eraly's.
- Difficulty setting: Normal shows population and rank on the info card, Hard hides rank, Harder hides both until the ring ends.
- Whole-world rings: no 10-ring cap, with rings continuing until they close at the point on the opposite side of the Earth from the start city (about 20,000 km away).
- An "Urban area" mode using GHSL populations instead of city proper.
- A population density map layer on the globe, for example [Kontur Population](https://data.humdata.org/dataset/kontur-population-dataset) hexagons, which would suit the pixel style.
- Daily puzzle with a shareable result.
- Sound effects and ambient pixel scenery.

### Open decisions

- **Capped Chinese cities (from milestone 2):** about 45 Chinese cities have GeoNames populations above 750,000 but appear on neither urban-population source, so their real urban figure is below 750,000 but unknown (for example Lüliang, Bazhong, Qingyang, Liupanshui). They are capped at 750,000 for now. Options: keep the cap, look up each figure by hand, or find a fuller source.
