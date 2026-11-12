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
| Ring size | Slider over 100, 250, 500, 750, 1,000, 1,500, 2,000 km (log-ish, with tick marks) | 500 km |
| Number of rings | Slider, 1–10, then ∞ at the right end (see Ring geometry); with ∞ the value reads e.g. "∞ (10 rings)" | 3 |
| Number of cities | Slider, 1–5 ("The biggest", "Top 2" … "Top 5"): find the ring's top N cities, in any order (stored as `citiesToFind`) | 1 |
| Misses per ring | Wrong in-ring guesses allowed; fixed at 3 for now (no slider; stored as `guessesPerRing`) | 3 |
| Suggestions | Toggle (see Guess matching) | Off |
| Hints | Toggle: offer the three hints in each ring | On |
| Sound Effects | Toggle: sound effects (see Visual style → Sound); stored as `sound` | On |
| Subdivisions | Toggle: state/province borders on the globe (fading in with zoom) and the state/province in every place name | Off |
| Population measure | City (city proper) / Metro (urban area, see Metro mode) | City |
| Mode | Cities or Countries (see Countries mode); chosen on the start screen (tiles above Start game) or at the top of Settings | Cities |

### Ring geometry

- Each city is a single point: its GeoNames latitude and longitude, usually the historic centre or main square, not a computed middle of its area.
- A city is in a ring only if its point is. Distance is the great-circle distance from the start city's point to that point; area overlap doesn't matter.
- Width `w` is constant for the whole game. Ring `k` covers distances from `(k−1)·w` to `k·w`, so every ring is full width.
- Ring 1 is a full circle of radius `w`, and the start city itself is excluded from it.
- A city belongs to ring `k` when `inner < d ≤ outer`, so no city is ever in two rings.
- A game has 1 to 10 rings (`RING_CAP` in `config.ts`), or ∞ (stored as `ringCount: 'all'`): rings keep coming as long as the next one ends before the far side of the Earth (the start city's antipode, `FAR_SIDE_KM` = π × 6,371 ≈ 20,015 km away), so a ring that would reach past it is left out and the ring before it is the last. That gives floor(20,015 / `w`) rings: 80 at 250 km, 13 at 1,500 km, 10 at 2,000 km. Even 10 × 2,000 km stays short of the far side, so rings never wrap around.
- The camera shows a ring that lies mostly within 10,000 km from the start city, fitted to its outer edge; a ring mostly beyond that can only be seen from the far side, so the camera looks at it from the antipode, fitted to its inner edge.
- Example: `w` = 1,000 km with 4 rings gives 0–1,000, 1,000–2,000, 2,000–3,000 and 3,000–4,000 km.

### Eligible cities and the answer

- Eligible = in the game's city list (population ≥ 15,000, cleaned as described under Data) and inside the ring.
- The answer is the eligible city with the highest population in the ring.
- An empty ring (all ocean, for example) shows "No cities in this ring" and advances automatically. It is recorded as empty, not as a miss.
- Random start cities are drawn from the well-known pool (population ≥ 500,000 or a national capital), balanced across continents: first a continent, weighted by (number of start cities on it) ^ `CONTINENT_BALANCE_EXPONENT` (0.5), then a city in it. That gives roughly Asia 35%, Africa 17%, Europe 15%, North America 14%, South America 12%, Oceania 6%; purely proportional picks would put 57% of starts in Asia. Continents come from GeoNames `countryInfo.txt` and are stored in `countries.json`.

### Metro mode

The Population measure setting switches what "population" means for the whole game.

- **City (default):** each city counts on its own, with its city-proper population.
- **Metro:** cities inside the same GHSL urban centre merge into one metro, represented by its main city (Newark and Jersey City become part of New York City). The metro sits at its main city's point for ring membership and uses the metro population. Cities outside every urban centre (mostly towns under 50,000) count on their own with their city population.
- In Metro mode the start city's whole metro is excluded from ring 1, and typing a member city's name autocorrects to its metro's main city (see Guess matching).
- Hover cards always show both figures, with the active one highlighted.

### Countries mode

Chosen with the Cities / Countries tiles (start screen and Settings; stored as `mode: 'cities' | 'countries'`; old saves with `'population'` mean Cities).

- **The answer** in each ring is the country with the most people living *inside that ring's band*, not its total population: a big country that only clips a ring scores just the people in that slice. People are counted from the population grid (`population.json`, see Data). A country counts as in a ring only with at least `COUNTRY_MIN_PEOPLE_IN_RING` (1,000) people inside it.
- **Which countries:** the 193 UN members, the 2 observer states (Holy See / Vatican City, Palestine) and 3 places whose status is disputed, kept as their own entries rather than take a side (Taiwan, Kosovo, Western Sahara): 198 in all. The other territories Natural Earth maps separately count toward the country that governs them (`TERRITORY_OF` in `build_population.py`): Hong Kong and Macao → China; Puerto Rico, Guam, the U.S. Virgin Islands, American Samoa and the Northern Marianas → United States; Greenland and the Faroes → Denmark; New Caledonia, French Polynesia, Wallis and Futuna, Saint Pierre and Miquelon, Saint Martin and Saint Barthélemy → France; Aruba, Curaçao and Sint Maarten → Netherlands; Åland → Finland; Norfolk Island → Australia; the Cook Islands and Niue → New Zealand; Bermuda, the Cayman, British Virgin and Turks and Caicos Islands, Anguilla, Montserrat, the Falklands, Saint Helena, Jersey, Guernsey and the Isle of Man → United Kingdom. French Guiana, Guadeloupe, Martinique, Réunion and Mayotte are already part of France in Natural Earth. GeoNames' "Palestinian Territory" is shown as "Palestine". population.json keeps each territory's people under its own code (with the `territories` map), and the game adds them to their country when it builds the rings, keeping each ring's split by area (`ring.areas`). On the globe a territory with people in the ring gets its own label over them, with its country after it: "Bermuda (United Kingdom)", "Aruba (Netherlands)" (countries named in full, without a leading "The"); the suggestions list shows a territory found by its name the same way ("Bermuda" with "United Kingdom" beside it), and picking it (or pressing Enter on a territory's name) fills in the territory's own name, with its country in grey after it and the usual note; the guess is the country's. A guess typed as a territory still counts as its country (and the country is right whenever only its territory is in the ring), but the guess remembers the territory (`Guess.area`), so the globe labels and tints only that territory; its hover card shows the territory's name with the country beside it, and the country's figures. A country's main label sits over its largest area in the ring. Typing a territory's name (or a small typo of it) fills in its country on Enter, with a note under the box: "Puerto Rico counts as part of the United States" (`territories` in population.json, `territoryTyped` in `core/matching.ts`).
- **The start city's own country counts** like any other: near home it is often the answer (people right at the start point are in ring 1). (An earlier version left it out.)
- **Guessing:** country names and aliases ("USA", "Türkiye", "DRC"), with the same autocorrect, picker and suggestions as cities (placed by continent in lists). "Not in this ring: Chile is 1,200 km outside" measures to the country's nearest people.
- **Number of countries** (the Number of cities slider, renamed in this mode), misses, Skip, ∞ rings, hints, history and sounds work as in Cities mode. Population measure (City / Metro) doesn't apply and is greyed out.
- **On the globe:** a guessed country is tinted in its result's colour (green, red; fainter for earlier rings: `--country-fill-opacity`, `--country-fill-faded-opacity`) **only inside the ring it was guessed in** (the tint is clipped to that ring's band), and its name, with no square, sits over where its people in that ring live (the population-weighted centre of its squares in the ring), in the result's colour. A country guessed from outside the ring has no part inside it, so it shows only its yellow name (at its own middle).
- **Hints** (see Hints): 1. every country with people in the ring, tinted inside it; 2. a circle where each answer left has its people in the ring, much larger than for cities (`HINT_AREA_COUNTRIES`: 1.5 × the ring width across, so it spans several countries; at least 50% of it inside the ring rather than 70%); 3. each one's first letter there (just the letter, no square, like the country names).
- **Reveal and summary:** the top 5 countries with their people inside the ring. Hovering the start city shows just its name and country (its City / Metro figures don't apply here). The hover card shows "Ring" (the people inside the ring, the ranked figure) and "Total" (the whole country), plus the rank or the distance outside.
- **How:** each country is a "unit" with a stable id (1,000,000,000 + its two letters) and a city-shaped entry (name, aliases, the centre of its people, its total population) kept in `byId` but never in `cities`, so matching, history, reveal and summary work unchanged (`src/core/countries.ts`). When a game starts, every populated square (about 250,000) is put in its ring by distance from the start city, and people are summed per country per ring, in a few milliseconds.

### Guessing

1. The globe flies to the start city and draws ring 1.
2. The player types a guess. Typos, accents and abbreviations are corrected automatically, and a suggestions dropdown can be turned on in settings; see Guess matching.
3. A guess outside the current ring places a yellow marker on that city and shows "Not in this ring". It does not use a guess. A repeated guess is ignored.
4. The ring's **targets** are its top N cities (N = Number of cities, capped at the cities in the ring). A guess that is a target places a green marker ("Mumbai is #2 in the ring!", or "Reading is right!" when N is 1). Finding a target is free.
5. A guess inside the ring that isn't a target places a red marker on that city and uses one of the 3 misses (the squares in the box show misses left).
6. The ring ends as solved when every target is found, or as missed after 3 misses (or Skip), and every target not found is revealed with a green marker. With N > 1 the box shows "Find the top 3 · 1 found" on the right of the start-city line, the reveal headline says "Solved · 5 guesses" or "Missed · 1 of 3 found", and the target ranks in the reveal list are in the accent colour.
6b. Scoring gives partial credit: each ring scores cities found out of cities to find. The summary says "2 of 3 rings solved" when N is 1 and "4 of 6 cities found" otherwise; History's total is the share of cities found over all games; a ring's square is green (all found), yellow (some), red (none) or grey (empty). Records saved before this setting count as one target per ring, found if solved.
7. After each ring, a reveal panel lists the ring's top 5 cities by population, with the player's guesses coloured. A Next ring button then zooms the camera out to fit the next ring.
8. Markers from earlier rings stay on the globe, faded.

### Guess info card

Hovering over any guessed city's marker (tapping on phones) shows a small card:

- Name, then on the same line in smaller dim text the country (and state or province with the Subdivisions setting). The card is as wide as its widest line (so the figures sit right under the name, not far off to the side), up to `INFO_CARD.width`; past that a long place moves to the next line whole rather than running past its edge. Flags come later.
- Population: both the city figure and the metro figure (when the city is in a metro), with the one for the current Population measure highlighted. In Metro mode the card is for the metro's main city and also says how many cities the metro merges.
- Rank in the ring, written as "#2 of 14" (2nd most populous of the 14 cities in this ring).
- For a yellow (outside) guess, distance instead of rank, for example "120 km outside".

All of this shows as soon as a city is guessed. A difficulty setting that hides some of it is planned for later.

### Screens

The game is called **GeoRing** on screen (a working title). The globe always fills the screen; everything else floats on top of it, centred.

- **Start screen**: the title (pixel display font, pale mint with a slight 1 px green/blue split, kept subtle so it stays readable), a tagline ("Find the most populous city in each ring", or in Countries mode "Find the most populous country in each ring"), the Cities / Countries tiles, a big Start game button and a one-line summary of the current settings (settings live in the menu). The globe rests low on the screen like a horizon (`--globe-rest-offset`, a share of the screen height), a little larger than the whole-Earth view (`HOME_ZOOM`). The renderer moves the globe inside its canvas rather than moving the canvas, so the map always fills the screen and no canvas edge shows while it rises or sinks, even when zoomed in. On page load the globe waits below the screen (`INTRO.globeFrom` × the rest offset down) until the city data is ready, then rises to that resting place (`INTRO.globeMs`, easing out) while the start screen comes in. (Unpacking and indexing the data takes about half a second of the browser's time, during which nothing can be drawn; rising during it made the animation stutter, so the rise waits for it. The city and country name indexes, the slowest part, are built on first use or in an idle moment just after the intro.) The start screen comes in: the title drops in from above, then the tagline fades in and the Cities / Countries tiles, Start game and the settings line rise from below, each `INTRO.staggerMs` after the one before (also when coming back from a game). With reduced motion set on the device, both are skipped. It turns slowly (`IDLE_SPIN_DEG_PER_SEC`) from the moment the page opens, even while the city data is still loading ("Loading cities…" shows over it); it can't be dragged or zoomed there. Starting a game plays a sequence (timings in `config.ts`): the title and tagline lift away and the button and summary drop away (`START_EXIT_MS`), the globe rises to the centre (`GLOBE_RISE_MS`; the start screen is marked as leaving before the first paint, so it never blinks out for a frame), then the camera flies to the start city, always taking `FLY_START_MS` however near or far the city is, and the in-game box slides down from the top (`HUD_ENTER_MS`). UI animations use smooth easing curves (`--ease-out`, `--ease-in`); stepped easing looked like dropped frames at these sizes. Leaving a game flies the globe home while it sinks back to the horizon, and it spins again.
- **Menu** (hamburger button, top left, always available): a popup tile grid like Krillion's and Eraly's. Play: New game (back to the start screen), Settings. More: History (from milestone 7) and About (from milestone 9: how to play and credits). Below them a full-width **Buy me a coffee** tile (pixel coffee cup, in its own warm amber `--support`: amber text, a warm border and a faint warm background, fully amber on hover) opens `SUPPORT_URL`, a Stripe Payment Link where players choose the amount, in a new tab; About's last line links it too ("Enjoying GeoRing? Buy me a coffee"). The site has no server, so a payment link (not an embedded checkout) is what fits. Settings, History and About opened from the menu go back to the menu when closed (×, Escape, a click outside, or Settings' Done); History opened from the summary goes back to the summary; a past game opened in History steps back to the History list; Replay this game closes every popup.
- **Settings** popup: start city (Random, or Pick a city with a search box), Ring size, Number of rings and Number of cities sliders, Population measure, Mode (Density shown disabled), and square toggle switches for Suggestions, Hints, Subdivisions and Sound Effects. Changes are saved at once (`ringgame.v1.settings`); game rules apply to the next game, while Subdivisions applies straight away.
- **In game**: a box at the top centre with "Ring k / n", the ring's distance band and guess squares; the start city on one line: a small uppercase "FROM" label, the city name in the start diamond's turquoise, then its place in dim text (its populations are no longer shown here; hovering the start diamond on the globe shows them), with the progress ("Find the top 2 · 0 found") on the right of the same line when there are several cities to find; the guess box; the last guess's outcome ("Not in this ring: Paris is 244 km outside", "Bristol is in the ring, but not the biggest", "Reading is right!"); and a **Skip** button (outline turns red on hover; same height as the hint button beside it) that gives up on the ring. When a ring ends only the guess box goes; Hint and Skip stay, greyed out, so the box keeps its spacing (it counts as missed, marked skipped, and the answer is revealed). The guesses themselves show as markers on the globe. Guessing the start city (or a city in its metro) and repeated guesses are ignored with a note.
- **Reveal** popup (bottom centre, so the ring stays visible) when a ring ends: a short uppercase headline, "SOLVED · 4 GUESSES", "MISSED · LAHORE" or "SKIPPED · LAHORE" (with several cities to find, "MISSED · 1 OF 3 FOUND"), the top 5 with the player's guesses coloured (the city name green for the right guess, red for a wrong one; the place and any "…" stay dim; no squares), then Next ring (or See summary on the last ring). An empty ring shows "No cities in this ring" for `EMPTY_RING_ADVANCE_MS` and moves on by itself.
- **Summary** popup: rings solved, each ring's answer, population, result and hints used, with Play again (same settings, new seed), Main menu and History. The game is saved to history when it finishes (from milestone 7). It has a close (×) button (or Escape, or a click outside it) that hides it so the globe can be dragged around the finished game; a See summary button at the bottom centre brings it back. With History open over it, Escape closes only History (always only the topmost popup).
- Place names: cards and headers show "City, Country". Pick-lists (start-city search, picker, suggestions) add the state or province only when another city shares the name and it differs from the country ("Dhaka Division, Bangladesh" vs "Bihar, India"). Population lines read "City" and "Metro".
- The info card follows the mouse on desktop; on phones a tap on a marker pins it and a tap elsewhere closes it.

### Hints (3 per ring)

Hints unlock in a fixed order, 3 per ring in all, and each covers **every target not found yet** when it is taken (up to Number of cities / countries; with one to find it is just the answer). A target's circle and letter disappear once it is found; the country tint stays. They cost no guesses and no points, but hint use is recorded in history. (An earlier version aimed each hint at the biggest target left and started over when it was found.)

1. **Countries:** Cities mode: the countries of the cities left to find (up to X countries) are outlined and tinted on the globe. Countries mode: every country with people in the ring is outlined and tinted whole, not just its slice inside the ring, so its shape is recognisable, along with the territories that count toward it (the Netherlands with Aruba, Curaçao and Sint Maarten; guessed countries' tints include them too) (naming the answers' own countries would give them away). The camera glides (same zoom, `HINT_PAN_MS`) to where those countries lie within the ring: for cities the average of each country's cities in the ring (averaged on the sphere, so it works across the date line; a big country's own middle can be far from the ring, Russia's is in Siberia), for countries the centre of the ring's people.
2. **Area circles:** a circle around each target left (in Countries mode, around where that country's people in the ring live). Each circle: Its diameter is 0.75 × the ring width (a 750 km circle for 1,000 km rings; `HINT_AREA_RADIUS_FRACTION` = 0.375). Its centre is offset from the answer in a random direction by a random share of the radius up to 80% (`HINT_AREA_MAX_OFFSET_FRACTION`, spread evenly over the disc), so the answer can be anywhere inside it, not just in the middle. The circle must also lie mostly inside the ring (at least 70% of its area, `HINT_AREA_MIN_IN_RING`) and over land (at least 50%, `HINT_AREA_MIN_LAND`, from the land grid in `land.json`). Up to `HINT_AREA_TRIES` (40) seeded placements are each measured at `HINT_AREA_SAMPLES` (64) points spread evenly over the circle; the first that meets both wins, otherwise the one that comes closest (a small island such as Honolulu can't reach 50% land). When they appear, the camera glides to the middle of the circles at the same zoom (`HINT_PAN_MS`); a circle goes when its target is found while the others stay as they are. (An earlier version shrank the circle until it held 5 cities; in dense regions that made it too small to be useful.)
3. **Dots and first letters:** a dot for each target left (Countries mode: where its people in the ring live) in `--hint`, labelled with only the first letter of its display name and four stars ("N****" for New York; always four, so they don't give away the name's length). They fade in, have no info card, go when found, and are replaced by the answers' own markers when the ring ends.

How they appear (from milestone 6): a hint button in the in-game box (a pixel lightbulb and the number left, in lightbulb yellow `--bulb`) gives the next one. Hints show only on the globe (no text line in the box). On the globe the country is tinted and outlined in `--hint` under the rings (drawn from the current detail level's country shapes, matched by `cc`), and the area circle is a dashed `--hint` circle above the rings. Both fade in over `HINT_FADE_MS`, and fade out the same way when the next ring starts (or the game ends). With the Hints setting off, the button is hidden and `useHint` does nothing. Checked near the pole (Murmansk: all of Russia, which crosses 180°), across the date line (Suva: Fiji) and in a dense region (Delhi).

### End of game

A summary screen shows each ring's answer, whether it was solved (and in how many guesses), missed or skipped, and the hints used. The game is saved to history as it finishes. Buttons: Play again (same settings, new seed), Main menu, and History (on phones Play again takes its own row).

## Data

City data comes from GeoNames (city-proper populations), map shapes come from Natural Earth, and a one-time script turns both into small static files shipped with the site. The game makes no network calls for data at runtime beyond loading its own files.

### Sources

| Dataset | Used for | Files | License |
| --- | --- | --- | --- |
| [GeoNames](https://download.geonames.org/export/dump/) | Cities, populations, coordinates, alternate names | `cities15000.zip`, `countryInfo.txt`, `admin1CodesASCII.txt` | CC BY 4.0, attribution required |
| [Natural Earth](https://www.naturalearthdata.com/downloads/) | Land, coastlines, country borders, lakes | Admin 0 countries + land at 1:110m, 1:50m, 1:10m | Public domain |
| [GHSL](https://human-settlement.emergency.copernicus.eu/download.php) | Metro mode (now), Density mode (later), and a check on city figures | Urban Centre Database R2024A V1.2 (`GHS_UCDB_GLOBE_R2024A_V1_2.zip`, 264 MB) | European Commission reuse notice: reuse authorised with the source acknowledged (cite the dataset; see its readme) |
| [GHS-POP R2023A](https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php) | Countries mode: people per country inside each ring | 2025 epoch, 30″ (~1 km) grid in WGS84 (`GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.zip`, 484 MB) | European Commission reuse notice: reuse authorised with the source acknowledged |
| [citypopulation.de](https://www.citypopulation.de/) | 2020 census urban populations for Chinese cities | Copied into `pipeline/china_urban_2020*.csv` | CC BY 3.0 (their terms of use, checked for milestone 9): credit "Thomas Brinkhoff: City Population" with a link, and name the original source (China's 2020 census) |

### Pipeline (`pipeline/build_cities.py`, run by hand, not at runtime)

1. Download the raw files into `pipeline/raw/`, which is git-ignored.
2. Keep populated places (feature class `P`) with population ≥ 15,000. Drop feature codes `PPLX` (city sections), `PPLH` (historical), `PPLQ` (abandoned), `PPLW` (destroyed) and `PPLCH` (historical capital).
3. Fix Chinese populations with 2020 census urban-area figures, matched by name + province, from `pipeline/china_urban_2020.csv` (Wikipedia and citypopulation.de's list of cities over 750,000) and then `pipeline/china_urban_2020_provinces.csv` (citypopulation.de's per-province pages, every city and county seat over 75,000 in 15 provinces), which fills cities the first file lacks. A later file never re-matches a name an earlier one used. Any Chinese city still above 750,000 without a figure is capped at 750,000 (`CN_UNLISTED_CAP`); none are at present. Then apply `pipeline/overrides.csv` (columns: geonameid, field, value, note), which wins over everything else. This fixes bad populations and removes entries, each with a note on why.
4. Build aliases from GeoNames `alternateNamesV2.zip` (it has language tags, unlike the column in `cities15000`). Keep Latin-script names starting with a capital (or tagged `abbr`), deduplicated after normalization, at most 10 per city, ranked: English, abbreviations, the country's own languages, major European languages (fr, de, es, pt, it, nl), then at most 3 untagged names. Other languages are skipped because they are mostly transliterations. Then merge `pipeline/aliases_extra.csv` for abbreviations GeoNames lacks (most, such as NYC, LA, SF, KL, HCMC and CDMX, are already there; DC was added).
5. Flag well-known cities: population ≥ 500,000, or feature code `PPLC` (national capital).
6. Write `public/data/cities.json` and `public/data/countries.json` (country code → display name + aliases, such as Turkey/Türkiye).
7. `pipeline/build_geo.py` converts the Natural Earth layers to quantized TopoJSON with [mapshaper](https://github.com/mbloch/mapshaper) (an npm dev dependency): `world-110m.json` (land, countries) and `world-50m.json` (land, countries, lakes) in `public/data/geo/`. Countries keep `cc` (from `ISO_A2_EH`) and `name`. It also writes `subdivisions.json` (0.8 MB): lines between first-level subdivisions of the same country (states, provinces) from Natural Earth's 1:10m admin-1 layer, simplified 6%, loaded only when the Subdivisions setting is on. `npm run data` runs both scripts.
7c. `pipeline/build_population.py` (Countries mode) is the one pipeline script that needs Python libraries (numpy and rasterio, listed in `pipeline/requirements.txt`, installed in a virtual environment: `python3 -m venv pipeline/.venv`, then `pipeline/.venv/bin/pip install -r pipeline/requirements.txt`, run with `pipeline/.venv/bin/python pipeline/build_population.py`). It draws the Natural Earth 1:50m countries onto a 2.5′ grid (smaller countries last so they keep their squares; Somaliland, N. Cyprus, Baikonur, Siachen and Kosovo mapped to the codes GeoNames uses), lets squares just off the simplified coast borrow the nearest country (up to 6 squares, ~28 km, so coastal cities keep their people), reads GHS-POP in 0.25° strips, and writes `public/data/population.json`: people per country per 0.25° square (rows from 90°N, columns from 180°W; per country a flat list of delta-encoded square indexes and whole-number people; squares under 1 person dropped).
7b. `pipeline/build_land.py` rasterises the 1:50m land minus lakes onto a 0.25° grid (a cell is land when its centre is) and writes `public/data/land.json` (173 kB; bits packed 8 per byte, base64), which the area hint uses to stay over land. `npm run data` runs it after the other two.
8. Join cities to GHSL urban centres (`pipeline/metros.py`): a city is in a metro if its point lies inside the centre's outline. Cities of 100,000+ within 5 km of an outline are snapped to it (GeoNames points are sometimes just outside). Each metro's main city is its most populous member, unless the GHSL name matches a member with at least half that population ("Guangzhou" over slightly larger Shenzhen), or `overrides.csv` sets `metroMain` (Islamabad, Kuwait City). A metro's population is the GHSL 2025 figure, but never less than its main city's (GHSL undercounts some Chinese cities, such as Chengdu at 5.6M against 13.6M census urban). Write `public/data/metros.json`.
9. Print a sanity report: total city count, the 25 most populous cities, every city above 10 million, and the ring answers for a few test start cities (New York, London, Tokyo, Lagos, Chongqing) in both measures, plus a metro report: the top metros, big cities outside every metro, and cities whose own figure is larger than their metro's (likely district totals).

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
| `metro` | GHSL urban-centre id, if the city is inside one (omitted otherwise) |

### Metro record (in `metros.json`)

| Field | Meaning |
| --- | --- |
| `id` | GHSL urban-centre id (`ID_UC_G0`) |
| `name` | GHSL name, for reference (the game shows the main city's name) |
| `pop` | Metro population used by the game |
| `ghslPop` | GHSL's own 2025 figure, before the never-below-main-city rule |
| `main` | GeoNames id of the main city |
| `cc` | Country of the main city |
| `members` | Number of cities in the metro |

About 8,100 of GHSL's 11,400 urban centres contain at least one city. The rest (about 350M people in total, mostly small agglomerations in India and Africa) have no city in the list and can't come up in Metro mode.

Expect roughly 25,000–30,000 cities and a file of a few MB, which compresses well and is fine to load once.

### Known data issues to handle

- **Country abbreviations:** GeoNames' short all-capitals country aliases are often from other languages or wrong (the UK had "RU", "VK" and "DU"; South Africa "USA", from "Union of South Africa"), so for countries they are dropped, and a hand-checked list in `pipeline/country_aliases.csv` adds the common ones: DRC, DR Congo, UAE, UK, US/USA, CAR, PNG, BiH, KSA, RSA, DPRK, ROK, PRC, ROC, NZ and a few spelling variants.
- **Duplicate GeoNames entries (from milestone 9 follow-ups):** GeoNames sometimes lists one place twice (Kashan, La Ceiba, Komárno), which showed as two identical suggestions. `build_cities.py` treats two entries with the same name, region and country as one when they are within `DUPLICATE_KM` (10 km) or have exactly the same population (then one is usually a different small place that was given the other's figure, as with the two Sahiwals in Punjab). It keeps the bigger one; on a tie, the one GeoNames ranks higher as an administrative seat (PPLC, PPLA, PPLA2 …, then PPL), then the lower id. Cities named in `overrides.csv` are left alone. 17 entries are removed this way. Buenaventura (Colombia) has a second, municipality-wide entry 33 km away with a different population, so it is removed by hand in `overrides.csv`.
- **Oversized Chinese "cities":** many GeoNames populations cover whole prefectures, not just Chongqing (22M in GeoNames, 9.6M urban): Chengdu, Xi'an, Harbin, Weifang and about 180 others. About 500 are replaced with 2020 census urban-area figures. GeoNames also has a few Chinese entries under the wrong name or twice (Guankou for Liuyang, Chengtangcun for Tengzhou, Zhucheng twice); these are renamed or removed in `overrides.csv`. Smaller Chinese cities in the 16 provinces without a per-province list (Liaoning, Xinjiang, Heilongjiang, Hebei, Henan, Guangdong and others) still use GeoNames figures; 44 of them are 300,000 or more.
- **Boroughs and wards listed as cities:** GeoNames lists some city parts as their own cities. Smaller ones are kept, but parts that showed up as ring answers for the test start cities are removed through `overrides.csv`: New York's five boroughs, all 86 places inside Greater London, Shanghai's 14 urban districts and Shenzhen's Bao'an. If another one shows up as an odd answer in play, remove it the same way.
- **Other whole-district figures:** GHSL shows that Ho Chi Minh City (14.0M city, 14.6M urban area) and Lahore (13.0M, 14.3M) are not inflated: their boundaries roughly match the built-up city. The metro report's "city larger than its metro" list finds the ones that are, mostly district or county totals in India, Pakistan, Kenya and the Philippines (Kakamega 1.87M against a 125k town, Nowrangapur 1.2M against 60k). Japanese, Korean and Chinese municipalities also appear there because they legitimately include countryside. Not yet corrected; see Open decisions.
- **Uneven population years:** GeoNames figures come from different census years by country. This is acceptable for a prototype; note it in the credits.
- **Attribution:** the About popup (menu → About, from milestone 9) has How to play (shared rules, then a short Cities and a Countries section, then Settings) and credits GeoNames (CC BY 4.0), the GHS Urban Centre Database (European Commission JRC 2024, with its DOI), the Chinese urban figures (2020 census of China via Thomas Brinkhoff: City Population, CC BY 3.0, and Wikipedia), Natural Earth (public domain) and the fonts (SIL Open Font License), notes that population years differ by country, and links the source code. It also has a short How to play.

## Guess matching

A guess is resolved to one city by normalizing it, checking exact names and aliases, then falling back to fuzzy matching, so "sao paulo", "NYC" and small typos all work. Matching lives in `src/core/matching.ts` as pure functions with unit tests.

### Steps

1. **Normalize** both the guess and every name: lowercase, strip accents (Unicode NFD, then drop combining marks), turn hyphens and apostrophes into spaces, drop other punctuation, collapse whitespace. "São-Paulo" and "sao paulo" become the same string. Precompute normalized names once at load.
2. **Exact match** on normalized `name`, `ascii` or any alias. Search cities in the current ring first; if there's no hit, search all cities so the game can say "Not in this ring".
3. **Fuzzy match** when nothing matches exactly, using [Fuse.js](https://www.fusejs.io/) or a small Damerau-Levenshtein function (which counts letter insertions, deletions, substitutions and swaps). Accept the best match if its edit distance is ≤ 1 for names of 4–5 letters, ≤ 2 for 6–9 letters, and ≤ 3 for 10 or more. Prefer in-ring candidates.
4. **Ambiguity:** exact display-name matches beat alias matches. If several cities match, prefer the in-ring one. If two or more in-ring cities share the name, a picker shows them with `admin1` and country. The largest of the candidates (the in-ring ones if any are in the ring, otherwise all) wins unless another is at least half its size (`AMBIGUOUS_POP_RATIO`), in which case a picker lists those similar-sized ones: "Springfield" (Missouri, Massachusetts, Illinois) asks; "Paris" (France 2.1M, Texas 25k), "Newark" (New Jersey over Ohio) and "Dhaka" (Bangladesh over a small Dhāka in Bihar, even when both are in the ring) don't. In Metro mode every match is then mapped to its metro's main city.

### Suggestions dropdown (setting, off by default)

With the dropdown off, the player types a name and presses Enter (or the submit button), and the steps above resolve it. No list of cities is ever shown while typing. The only exception is a guess that matches two or more cities equally (for example "Springfield"): then a small picker lists just those cities with state and country.

**Two-step guessing (like Krillion):** the box is first filled with a city's display name, then Enter guesses it. If the typed text is already exactly a display name (after normalizing), one Enter guesses. Otherwise (a typo, an alias such as "NYC", or in Metro mode a member city such as "Newark") the first Enter replaces the text with the resolved name ("Nwe Yokr" → "New York City") without using a guess. Choosing from the picker or the suggestions dropdown (click, or arrows + Enter) also only fills the box. The filled-in city is remembered, and its place is shown in grey inside the box ("Missouri, United States"), so a second Enter guesses exactly that city even when others share its name. Editing the text starts over.

With the dropdown on:

- It appears after 2 typed characters and shows up to 6 suggestions from all cities worldwide, ranked by prefix match, then fuzzy score, then population.
- Population here (and when resolving a typed name) means the population of the city whose name matched, not of the unit it stands for. In Metro mode a small town can belong to a huge metro: ranking by the metro put New York City (via Perth Amboy) above Perth for "perth", and Mexico City (via a small "Santiago…") above Santiago, Chile for "santiago". A member city still leads to its metro ("Newark" → New York City), it just no longer outranks a real city of that name. Such a suggestion says why it's there: "Los Angeles · via Buena Park · California, United States" for "buen".
- Ranking never uses ring membership, so the list gives no clue about which cities are in the ring.
- Each suggestion shows the name plus country (and state when the name is shared). Clicking one, or arrow keys and Enter, fills the box; Enter with none highlighted fills the top suggestion. A second Enter guesses.
- The dropdown never shows populations.

In both cases, a guess that can't be matched to any city shows "City not found" and doesn't use a guess.

## Globe

The globe is drawn by hand with [d3-geo](https://d3js.org/d3-geo) (orthographic projection) on an HTML canvas, which gives full control over the look. It should feel like a stripped-down Apple Maps: land, water, coastlines and borders, with no labels except the game's own markers.

### Interaction

- North always stays up. Dragging sideways spins the Earth around its own axis (any amount); dragging up or down tilts the view between the poles but never past them, so the globe can't turn upside down. Sideways speed is divided by cos(latitude) (capped near the poles) so the centre follows the pointer.
- A drag released while still moving keeps spinning and slows down (momentum, `INERTIA` in `config.ts`). A drag that stopped before release doesn't. Speed is in screen pixels, so it covers fewer degrees when zoomed in.
- Trackpad two-finger swipes pan in both directions (sideways spins, up/down tilts); macOS supplies their momentum. Pinch (ctrl+wheel) and mouse wheels zoom toward the pointer; double-click zooms in. Swipe vs mouse wheel is decided once per burst of wheel events (`WHEEL` in `config.ts`): wheels that report lines, or large whole-number steps with no sideways part, count as a mouse.
- Zoom ranges from the whole Earth down to about a 100 km wide view.
- Smooth camera moves: fly to the start city at game start, then zoom out to fit each new ring with its outer edge at about 50% of the shorter screen side (`RING_FIT_FRACTION`), placed by how far round the Earth the ring is (`RECENTRE_FRACTION` = 1/3 of the way to the far side): rings in the first third (outer edge up to about 6,700 km) are centred on the start city; rings in the last third (inner edge from about 13,300 km) are centred on the point opposite it, zooming in as they close around it; in between the camera only zooms out (`zoomOutTo`, never in), staying wherever the player is looking, so it doesn't swing away from the side of the ring they were studying. On a long hop the camera pulls back mid-flight until both ends fit in 75% of the shorter side (`FLY_PULLBACK_FIT_FRACTION`), a gentle zoom-out rather than a big one.
- Works with mouse and touch.

### Layers (bottom to top)

0. Stars (from milestone 8 follow-ups, `src/ui/globe/sky.ts`): `STARS.count` (1000) pixel stars (`--star`, opacity 0.25–0.75) spread evenly over a sky sphere from a fixed seed, so the sky is the same every visit: mostly 2 px squares, some 3 px, and a few (2%) a pixel "+" (a 3 px square with four half-bright arms). The sky turns with the globe's rotation (idle spin and dragging) but doesn't zoom: its visible half is projected (orthographically) to span `STARS.skyScale` (0.75) × the screen diagonal, centred on the globe. Drawn first, so the Earth hides the stars behind it; when zoomed in, the globe covers them all. (Tried and dropped: pixel planets as an easter egg, too distracting; and a distance-keeping sky projection that showed more sky around the Earth but stretched it near the screen edges.)
1. Ocean: the sphere filled with the ocean colour, plus a faint graticule (10° lines).
2. Land fill.
3. Lakes, at every zoom (more appear at higher detail).
4. Country borders, at every zoom: fainter on the whole-Earth view, full strength from `BORDER_OPACITY.fullAtZoom`. Disputed borders (`DISPUTED_BORDERS`: Western Sahara / Morocco, Kosovo / Serbia) are drawn the same way but dashed (`--globe-disputed-dash` / `--globe-disputed-gap`); those places' other borders stay solid. Natural Earth draws Western Sahara as it is controlled on the ground (most of it inside Morocco, "W. Sahara" only the strip east of the berm); like most globes and UN maps, the game draws the whole territory instead: `build_geo.py` (`western_sahara_args`, also used by `build_population.py`) moves Morocco's part south of 27°40'N into Western Sahara, so the dashed line runs along that parallel and Laayoune's and Dakhla's people count for Western Sahara (about 0.7 million) in Countries mode.
5. Hint country highlight (outline + tint).
6. Current ring: a donut filled with a translucent accent and stroked on both edges. Ring 1 is a filled circle. Earlier rings are drawn as faint outlines only, fading with age: the ring just played at `--ring-past-opacity`, older ones down to `--ring-old-opacity` over `--ring-fade-rings` rings. For speed with many rings (80 at 250 km), each circle outline is built once and cached, an edge two rings share is drawn once, and outlines that can't be on screen are skipped (this cut the rings' share of a frame from about 13 ms to 3 ms on the whole-Earth view, under 1 ms zoomed in).
7. Hint area circle (dashed).
8. Markers: start city, guesses, correct answer.

### Detail levels

Islands, lakes and borders show at every zoom, with more detail as the player zooms in:

- `world-50m-lo.json`: 1:50m simplified with mapshaper (`-simplify 12% keep-shapes`): every island, lake and border, about a third of the size. Used when zoomed out; loads at startup.
- `world-50m.json`: full 1:50m, used from `DETAIL_50M_MIN_ZOOM` (4) up; loads the first time it's needed. During camera flights (game start, new rings, hint pans) the simplified map stands in for it, about a quarter of the work per frame, and the flight's last frame is drawn in full detail.
- Other savings per frame: stars aren't drawn once the globe fills the screen, nor those behind the globe; state/province borders aren't traced while zoomed out too far to see them; the canvas is drawn at the screen's pixel density up to `MAX_CANVAS_DPR` (2); Countries mode tints of the same country and result are clipped and filled once for all their rings.
- `world-110m.json`: a tiny placeholder shown only until the others arrive. Load 1:10m lazily, and only if 1:50m looks too coarse at close zoom. Join countries to cities by the `ISO_A2_EH` field: the plain `ISO_A2` field has `-99` for a few countries (France and Norway among them).

### Drawing performance (from milestone 4)

- Each polygon and border line gets a bounding circle when a detail level loads (`ui/globe/layers.ts`); a frame only traces shapes that overlap the visible part of the globe.
- The projection's clip circle shrinks to just enclose the screen when zoomed in (instead of the whole hemisphere), so d3 drops far-away vertices before projecting them.
- Adaptive resampling (`RESAMPLE_PRECISION_PX`) is on for the graticule, the rim and rings, whose long lines would otherwise become straight chords, and off for the map layers, whose edges are already short.
- Coastlines are drawn separately from the land fill, skipping the artificial edges Natural Earth adds where it cuts polygons at the 180° meridian and closes Antarctica at the pole. The fill is also outlined in the land colour to hide hairline gaps along those cuts.
- Measured in the in-app browser: about 5–9 ms per frame for the whole globe (50m-lo) and 5–15 ms zoomed in with full 1:50m.

### Drawing rings

Build each ring edge with `d3.geoCircle()` centred on the start city, radius in degrees = km ÷ 6,371 × 180 ÷ π. Draw the outer and inner circles in one path with the even-odd fill rule to get the donut. Geodesic circles stay correct near the poles and across the date line, where flat circles would distort.

### Markers

Markers are small pixel-style squares about 8 px, with a 1 px dark outline and a short pixel-font label:

- Start city: accent diamond.
- Guess outside the ring: yellow square.
- Wrong guess: red square.
- Correct or revealed answer: green square with a soft glow pulse when it appears.
- Every guessed marker opens the guess info card on hover or tap.

### Pixel-globe option (dropped)

A Pixel globe setting (the map drawn at half resolution with hard pixel edges, markers sharp on top) was built in milestone 8 and then removed; the crisp globe stays.

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
| `--accent` | #3FE0C0 | UI accent (turquoise): focus, selected tiles, toggles, start-city diamond |
| `--ring` | #3FE0C0 | Ring stroke (same turquoise); fill at 15% opacity |
| `--title`, `--glitch-a`, `--glitch-b` | #E4FBF2, #2FD27A, #2F8FE8 | Title text and its green/blue split (earthy, so it doesn't copy Krillion's pink/cyan) |
| `--subdivision-line` | = `--country-line` | State/province borders (Subdivisions setting), drawn thinner (0.5 px) and at most 55% opacity so they always stay fainter than country borders |
| `--hint` | #C792EA | Hint circle and hint country outline |
| `--correct` | #5FE08A | Correct answer marker and text |
| `--wrong` | #FF5C6C | Wrong guess marker and text |
| `--outside` | #F5D547 | Outside-the-ring guess marker and text |

Green, red and yellow are kept only for guess results, so the ring uses the cyan accent and hints use lilac.

### Type

- Display: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) for the title, popup titles and summary numbers (not the in-game "Ring k / n" or the reveal headline such as "SOLVED · 4 GUESSES", whose small digits were hard to read; those use the body font, semibold, the headline in uppercase with wide letter spacing) (chosen over Silkscreen; loaded from Google Fonts in `index.html` since milestone 5).
- Body: [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) for inputs, lists and body text.
- Section labels: uppercase, letter-spacing 0.2em, `--text-dim`, followed by a dashed rule (like "DIVE LOG" in Krillion).

### Components

- Popups taller than the screen scroll with a thin scrollbar in the theme's colours (`--border` thumb, no track).
- Buttons and tiles: square corners, a single 2 px `--border` outline, `--surface` fill, and small uppercase body text with wide letter spacing (like the menu tiles). Hover, keyboard focus and the selected state switch to an `--accent` outline and text; focus never adds a second ring. No popup button is pre-highlighted (the summary's two buttons look alike until hovered). The start screen's big Start game button keeps its pixel display font. Popup titles (Menu, Settings, Game over) use the same slight 1 px colour split as the start-screen title.
- Title: pixel font with a subtle split (two offset text shadows, green and blue) and a soft green glow. Popup titles use the same split.
- CRT finish over the whole page, popups included (from milestone 8): a 1 px dark scanline every 3 px (`--scanline`, `--scanline-gap`) and a soft vignette darkening the corners (`--vignette`). It never takes clicks.
- Pixel depth: buttons, tiles, toggles, the in-game box, popups and the info card cast a hard shadow straight down (`--shadow`, `--shadow-offset` 3 px; 2 px for Hint and Skip), and buttons press 2 px into it when clicked.
- Guess input: full-width monospace field with a thin turquoise cursor (a block cursor was tried and dropped). The dropdown (when on) is styled as a bordered panel list.
- Guess log per ring: rows like Eraly's time log, showing guess name and a yellow, red or green square, plus the revealed population after the ring ends.
- Pixel icons (menu, settings, sound, history, hint) drawn as small SVGs on a pixel grid.
- Motion: UI transitions and camera moves use smooth easing (`--ease-out` for arrivals, `--ease-in` for exits). Stepped easing (`steps()`) was tried and read as lag.

### Sound

Retro chiptune-style effects, synthesized on the fly with the Web Audio API (`src/ui/sound/`), so there are no audio files to load or license. Each sound is a few short notes (pitch, start, length, waveform, loudness) defined in `config.ts` (`SOUNDS`, master `SOUND_VOLUME`); the Sound effects setting turns them all off, except for its own toggle's switch sound, so switching it on is heard too. Audio starts on the first click or key press, as browsers require.

- Every button and tile: a short click. Moving a slider plays a softer, lower tick (one per step), and a toggle plays a two-note switch, rising when turned on and falling when turned off. A button can name its own sound instead (`data-sound`): Start game a rising arpeggio, Hint a sparkle, Skip three falling notes. The Guess button is silent, because the guess's result makes the sound.
- Guess results: found a target, a two-note "coin"; in the ring but wrong, a low falling buzz; outside the ring, a soft two-note "nope"; already guessed or the start city, a blip.
- A guess that ends the ring adds a short fanfare (solved) or a sad fall (out of misses); Skip doesn't add the fall.
- The game ends (the summary opens): a fanfare when at least half the cities were found (`GAME_WON_SHARE`), otherwise a gentle falling tune.

### Layout

- The globe fills the screen on every device; UI floats on top of it, centred: the in-game box at the top centre, the reveal popup at the bottom centre, and menu, settings and summary as centred popups over a dimmed page (see Screens).
- The menu button sits top-left and opens the menu tile grid.
- Phones: the same layout; the top box sits just below the menu button, popups fill the width, and the resting globe sits higher on the start screen. The box's top row (ring, band, guess squares, Hint, Skip) fits a 375 px phone; with a long band such as "1,000–2,000 km" the squares and buttons move together to a second line on the right. Distance bands are written with one unit and thin spaces around the dash ("0 – 1,000 km"). Start-screen lines are balanced so no word sits alone on a line.

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
- GitHub Pages for hosting at https://svnnyyu.github.io/georing/ (public repository `svnnyyu/georing`), deployed by `.github/workflows/deploy.yml` on every push to `main`: `npm ci`, `npm test`, `npm run build` (which type-checks), then publish `dist/`. A push whose tests fail is not published. The production build uses `base: '/georing/'` (vite.config.ts); every data fetch goes through `import.meta.env.BASE_URL`, so the same code works at the root in development.

### Folder layout

```
georing/
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
│   ├── china_urban_2020_provinces.csv  same, per province (fills gaps)
│   └── raw/                  downloads (git-ignored)
├── public/data/              pipeline output (committed)
│   ├── cities.json
│   ├── countries.json
│   ├── land.json             0.25° land/water grid (area hint)
│   └── geo/                  TopoJSON at 110m / 50m
├── src/
│   ├── config.ts             every tunable number
│   ├── core/                 game logic: no DOM, no React
│   │   ├── types.ts
│   │   ├── data.ts           index the data; "units" (city, or metro in Metro mode)
│   │   ├── geo.ts            haversine, ring membership
│   │   ├── land.ts           land or water at a point (land.json)
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
- Per ring: inner and outer radius, answer city id, guesses in order (city ids), solved / missed / empty, guesses used (outside-the-ring guesses don't count), whether it was skipped, hints used.
- The summary popup and a game opened from History are drawn from this same record, so they look identical.

### History screen

- Opened from the menu's History tile or the summary's History button.
- A list of past games, newest first: start city, rings × ring width (and "metro" in Metro mode), date and time, and the score as found/total ("18/20"), coloured from red (none found) through orange and yellow to green (all found), by mixing `--wrong` and `--correct`. (Earlier, a row of small squares, one per ring; too long for ∞ games.)
- Tapping a game opens its summary and offers "Replay this game", which reuses the seed and settings (so the same start city and rings) without changing the settings remembered for new games, and Back.
- Simple totals at the top: rings solved % and games played. With no games: "No games yet. Finished games show up here."
- A "Clear history" button with a confirmation step ("Delete all N saved games? This can't be undone."); the confirming button says Confirm (next to Cancel), and both it and Clear history turn red on hover.

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


### Density mode (idea)

Same rings, but the target is the densest city instead of the most populous. GeoNames has no city areas, so density needs another source:

- **Recommended:** GHSL Urban Centre Database, which has population and built-up area for every urban centre with 50,000+ people, measured the same way worldwide. Each GeoNames city inside an urban-centre outline takes that centre's density. Smaller towns are left out of density mode.
- **Alternative:** a population grid (GHSL GHS-POP at 1 km), using the people within a fixed radius of each city point, for example 5 km. It's consistent for every city, but measures the neighbourhood rather than the official city.

The core should allow `mode` to swap the ranking field without other changes, so density is mostly a data task.

### Other later ideas

- Scoring (fewer guesses and hints mean more points), with a score chart on the summary screen like Krillion's and Eraly's.
- Difficulty setting: Normal shows population and rank on the info card, Hard hides rank, Harder hides both until the ring ends.
- A population density map layer on the globe, for example [Kontur Population](https://data.humdata.org/dataset/kontur-population-dataset) hexagons, which would suit the pixel style.
- Daily puzzle with a shareable result.
- Sound effects and ambient pixel scenery.

### Open decisions

- **District-level city figures outside China:** about 40 cities of 300,000+ have a city figure several times their own GHSL urban centre (see the metro report). Options: fix the worst by hand in `overrides.csv` using citypopulation.de country pages, or leave them since Metro mode already handles them consistently.
