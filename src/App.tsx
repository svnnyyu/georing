// The app shell. The globe is created at once (resting low and spinning) so the page is alive
// while the city data loads; the game UI joins it when the data is ready: the start screen,
// or during a game the box at the top centre, the reveal popup and the summary. The hamburger
// menu (top left) opens the menu and settings popups. The camera flies to the start city when
// a game starts, zooms out to fit each new ring, and flies home when the game is left.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  FAR_SIDE_KM,
  FLY_START_MS,
  GLOBE_RISE_MS,
  HINT_PAN_MS,
  HUD_ENTER_MS,
  INTRO,
  RECENTRE_FRACTION,
  START_EXIT_MS,
} from './config.ts';
import { cityOrThrow } from './core/data.ts';
import { sphereCentre } from './core/geo.ts';
import { loadData, type LoadedData } from './data/loadData.ts';
import { MenuIcon } from './ui/components/Icons.tsx';
import { InfoCard, type CardAnchor } from './ui/components/InfoCard.tsx';
import { RevealPanel } from './ui/components/RevealPanel.tsx';
import { ringView } from './ui/globe/camera.ts';
import { GlobeView, type GlobeHandle } from './ui/globe/GlobeView.tsx';
import type { GlobeOverlay } from './ui/globe/overlay.ts';
import { MenuDialog, SettingsDialog } from './ui/screens/Dialogs.tsx';
import { AboutDialog } from './ui/screens/AboutDialog.tsx';
import { HistoryDialog } from './ui/screens/HistoryDialog.tsx';
import { Hud } from './ui/screens/Hud.tsx';
import { StartScreen } from './ui/screens/StartScreen.tsx';
import { SummaryDialog } from './ui/screens/SummaryDialog.tsx';
import { GameProvider, useGame } from './ui/state/GameProvider.tsx';
import { buildOverlay, parseMarkerId } from './ui/state/overlay.ts';
import { useGameSounds, useUiSounds } from './ui/sound/useSounds.ts';
import './ui/ui.css';

/** Animation timings from config.ts, handed to the CSS as variables. */
const timings = {
  '--start-exit-ms': `${START_EXIT_MS}ms`,
  '--globe-rise-ms': `${GLOBE_RISE_MS}ms`,
  '--hud-enter-ms': `${HUD_ENTER_MS}ms`,
  '--hud-enter-delay': `${GLOBE_RISE_MS}ms`,
  '--intro-item-ms': `${INTRO.itemMs}ms`,
  '--intro-first-delay': `${INTRO.firstDelayMs}ms`,
  '--intro-stagger': `${INTRO.staggerMs}ms`,
} as CSSProperties;

/** What the game UI controls on the globe, which lives above it in App. */
interface GlobeState {
  overlay: GlobeOverlay;
  up: boolean;
  spin: boolean;
  subdivisions: boolean;
}

type MarkerHandler = (id: string | null, x: number, y: number) => void;

interface GlobeControls {
  globe: RefObject<GlobeHandle | null>;
  setGlobe: (patch: Partial<GlobeState>) => void;
  /** The game UI registers its marker hover/tap handlers here. */
  markers: RefObject<{ hover?: MarkerHandler; tap?: MarkerHandler }>;
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GlobeState>({
    overlay: { rings: [], markers: [] },
    up: false,
    spin: true,
    subdivisions: false,
  });
  const globe = useRef<GlobeHandle>(null);
  const markers = useRef<{ hover?: MarkerHandler; tap?: MarkerHandler }>({});
  const setGlobe = useCallback((patch: Partial<GlobeState>) => setState((s) => ({ ...s, ...patch })), []);
  const controls = useMemo(() => ({ globe, setGlobe, markers }), [setGlobe]);

  // Once the intro has played, build the name indexes in a quiet moment, so the first guess
  // or city search doesn't wait for them.
  useEffect(() => {
    if (!loaded) return;
    const warm = () => {
      loaded.index();
      loaded.countryIndex();
    };
    const t = window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 2000 });
      else warm();
    }, INTRO.globeMs + INTRO.itemMs);
    return () => window.clearTimeout(t);
  }, [loaded]);

  useEffect(() => {
    loadData()
      .then(setLoaded)
      .catch((e: unknown) => setError(`Could not load the game data: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  return (
    <div className="stage" style={timings}>
      <div className={state.up ? 'globe-stage up' : 'globe-stage down'}>
        <GlobeView
          ref={globe}
          lowered={!state.up}
          ready={loaded !== null || error !== null}
          overlay={state.overlay}
          subdivisions={state.subdivisions}
          idleSpin={state.spin && !state.up}
          onMarkerHover={(id, x, y) => markers.current.hover?.(id, x, y)}
          onMarkerTap={(id, x, y) => markers.current.tap?.(id, x, y)}
          onError={(e) => setError(e.message)}
        />
      </div>
      {loaded ? (
        <GameProvider data={loaded.data} index={loaded.index} countryIndex={loaded.countryIndex}>
          <Game controls={controls} />
        </GameProvider>
      ) : (
        !error && <div className="center-screen loading">Loading cities…</div>
      )}
      {error && <div className="app-error">{error}</div>}
      <div className="crt" aria-hidden="true" />
    </div>
  );
}

type Dialog = 'menu' | 'settings' | 'history' | 'about' | null;

function Game({ controls }: { controls: GlobeControls }) {
  const { data, game, next, quit, settings, outcome } = useGame();
  useUiSounds(settings.sound);
  useGameSounds(game, outcome);
  const { globe, setGlobe, markers } = controls;
  const area = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<CardAnchor | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Settings, History and About opened from the menu go back to the menu when closed (×,
  // Escape, a click outside, Done); History opened from the summary goes back to it.
  const [fromMenu, setFromMenu] = useState(false);
  const openFromMenu = (d: Dialog) => {
    setFromMenu(true);
    setDialog(d);
  };
  // The summary can be closed to look around the globe; a See summary button brings it back.
  const [summaryOpen, setSummaryOpen] = useState(true);

  // Hand the globe what to draw.
  const overlay = useMemo(() => buildOverlay(data, game), [data, game]);
  useEffect(
    () => setGlobe({ overlay, up: game !== null, subdivisions: settings.subdivisions }),
    [overlay, game, settings.subdivisions, setGlobe],
  );

  // Start screen: shown with no game, and kept briefly while its exit animation plays.
  const [leaving, setLeaving] = useState(false);
  const gameKey = game ? `${game.seed}:${game.createdAt}` : null;
  // Was the start screen showing when this game began? (Not for Play again from a summary.)
  const prevGameKey = useRef<string | null>(null);
  const fromStart = useRef(true);
  // A layout effect, so "leaving" is set before the browser paints: otherwise the start
  // screen would vanish for one frame and then come back to play its exit (a flicker).
  useLayoutEffect(() => {
    fromStart.current = prevGameKey.current === null;
    prevGameKey.current = gameKey;
    if (!gameKey || !fromStart.current) return;
    setGlobe({ spin: false });
    setLeaving(true);
    const t = window.setTimeout(() => setLeaving(false), START_EXIT_MS);
    return () => {
      // Whatever happens next (the game ends, or the effect is re-run, as a live code reload
      // does), the start screen must not stay stuck half-way out with its title hidden.
      window.clearTimeout(t);
      setLeaving(false);
    };
  }, [gameKey, setGlobe]);

  // Camera: when a game starts, let the globe rise first, then fly to the start city; zoom out
  // to fit each new ring; fly home (and spin again) when back on the start screen.
  const cameraKey = game ? `${gameKey}:${game.current}` : null;
  const firstRing = useRef<string | null>(null);
  const firstMount = useRef(true);
  useEffect(() => {
    if (!game) {
      firstRing.current = null;
      if (firstMount.current) {
        // Page load: the globe is already spinning at home; leave it be.
        firstMount.current = false;
        return;
      }
      let live = true;
      void globe.current?.flyHome().then(() => live && setGlobe({ spin: true }));
      return () => {
        live = false;
      };
    }
    firstMount.current = false;
    const start = cityOrThrow(data, game.startId);
    const ring = game.rings[game.current]!;
    const view = ringView(start.lat, start.lon, ring.innerKm, ring.outerKm);
    const fly = (durationMs?: number) => void globe.current?.flyTo(view.lat, view.lon, view.radiusKm, durationMs);
    if (firstRing.current === gameKey) {
      // Next ring: centred on the start city in the first third of the way round, and on the
      // point opposite it in the last third (ringView). In between, only zoom out, staying
      // where the player is looking (often a side of the ring).
      const nearStart = ring.outerKm <= RECENTRE_FRACTION * FAR_SIDE_KM;
      const nearFarSide = ring.innerKm >= (1 - RECENTRE_FRACTION) * FAR_SIDE_KM;
      if (nearStart || nearFarSide) fly();
      else void globe.current?.zoomOutTo(view.radiusKm);
      return;
    }
    firstRing.current = gameKey;
    if (!fromStart.current) {
      fly(FLY_START_MS); // Play again: the globe is already up
      return;
    }
    const t = window.setTimeout(() => fly(FLY_START_MS), GLOBE_RISE_MS * 0.8);
    return () => window.clearTimeout(t);
  }, [cameraKey]);

  // Hints: the camera glides (same zoom) to the hinted countries' part of the ring, then to
  // the middle of the dashed circles.
  const ringHints = game && game.phase === 'playing' ? game.ringStates[game.current]!.hints : undefined;
  const countriesFocus = ringHints?.countries?.focus;
  const countriesKey = countriesFocus ? `${game!.current}:c:${countriesFocus.lat},${countriesFocus.lon}` : null;
  useEffect(() => {
    if (countriesFocus) void globe.current?.flyTo(countriesFocus.lat, countriesFocus.lon, undefined, HINT_PAN_MS);
  }, [countriesKey]);
  const areasFocus = ringHints?.areas ? sphereCentre(ringHints.areas.map((a) => a.circle)) : null;
  const areasKey = areasFocus ? `${game!.current}:a:${ringHints!.areas!.length}` : null;
  useEffect(() => {
    if (areasFocus) void globe.current?.flyTo(areasFocus.lat, areasFocus.lon, undefined, HINT_PAN_MS);
  }, [areasKey]);

  // Each game's summary opens when it finishes.
  useEffect(() => setSummaryOpen(true), [gameKey]);

  // A new ring or game closes any open info card.
  useEffect(() => {
    setCard(null);
    setPinned(false);
  }, [cameraKey]);

  const showCard = useCallback(
    (id: string | null, x: number, y: number, tap: boolean) => {
      if (!game) return;
      const ref = id ? parseMarkerId(game, id) : null;
      if (tap) {
        setPinned(ref !== null);
        setCard(ref ? { ref, x, y } : null);
      } else if (!pinned) {
        setCard(ref ? { ref, x, y } : null);
      }
    },
    [game, pinned],
  );
  markers.current = {
    hover: (id, x, y) => showCard(id, x, y, false),
    tap: (id, x, y) => showCard(id, x, y, true),
  };

  const bounds = { width: area.current?.clientWidth ?? 0, height: area.current?.clientHeight ?? 0 };
  const close = () => {
    setDialog(null);
    setFromMenu(false);
  };
  const back = () => (fromMenu ? setDialog('menu') : close());

  return (
    <>
      {/* Info cards are positioned in canvas coordinates; the canvas fills the screen, so a
          full-screen layer lines up with it. */}
      <div className="card-layer" ref={area}>
        {game && card && <InfoCard game={game} anchor={card} bounds={bounds} />}
      </div>

      <button type="button" className="icon-btn menu-btn" onClick={() => setDialog('menu')} aria-label="Menu">
        <MenuIcon />
      </button>

      {(!game || leaving) && <StartScreen leaving={leaving && game !== null} />}
      {game && game.phase !== 'finished' && <Hud game={game} />}
      {game && game.phase === 'ringOver' && <RevealPanel game={game} onNext={next} />}
      {game && game.phase === 'finished' && summaryOpen && (
        <SummaryDialog
          game={game}
          onHistory={() => {
            setFromMenu(false);
            setDialog('history');
          }}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {game && game.phase === 'finished' && !summaryOpen && (
        <section className="popup reveal">
          <button type="button" className="btn primary full" onClick={() => setSummaryOpen(true)}>
            See summary
          </button>
        </section>
      )}

      {dialog === 'menu' && (
        <MenuDialog
          onClose={close}
          onNewGame={() => {
            quit();
            close();
          }}
          onSettings={() => openFromMenu('settings')}
          onHistory={() => openFromMenu('history')}
          onAbout={() => openFromMenu('about')}
        />
      )}
      {dialog === 'about' && <AboutDialog onClose={back} />}
      {dialog === 'history' && <HistoryDialog onClose={back} onReplay={close} />}
      {dialog === 'settings' && <SettingsDialog onClose={back} />}
    </>
  );
}
