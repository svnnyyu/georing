// The start screen: title, tagline, a one-line summary of the settings, and the Start button,
// centred over the slowly turning globe that rests low on the screen like a horizon. When a
// game starts it plays its exit animation ("leaving") before it is removed.

import { ModeTiles } from '../components/ModeTiles.tsx';
import { countryName } from '../../core/data.ts';
import { formatKm } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

export function StartScreen({ leaving }: { leaving: boolean }) {
  const { data, settings, start } = useGame();
  const startCity = settings.startCityId === null ? null : data.byId.get(settings.startCityId);
  const summary = [
    startCity ? `From ${startCity.name}, ${countryName(data, startCity.cc)}` : 'Random start city',
    settings.ringCount === 'all'
      ? `Rings of ${formatKm(settings.ringWidthKm)} to the far side`
      : `${settings.ringCount} ring${settings.ringCount > 1 ? 's' : ''} of ${formatKm(settings.ringWidthKm)}`,
    ...(settings.citiesToFind > 1 ? [`Find the top ${settings.citiesToFind}`] : []),
    // Countries mode counts everyone in the ring, so City / Metro doesn't apply.
    ...(settings.mode === 'countries' ? [] : [settings.measure === 'metro' ? 'Metro areas' : 'City populations']),
  ];
  const countries = settings.mode === 'countries';
  return (
    <main className={leaving ? 'start-screen leaving' : 'start-screen'} aria-hidden={leaving}>
      <h1 className="hero-title">GeoRing</h1>
      <p className="tagline">
        {/* "within": in Countries mode only the people inside the ring count. */}
        {countries ? 'Find the most populous country within each ring' : 'Find the most populous city in each ring'}
      </p>
      <div className="start-modes">
        <ModeTiles />
      </div>
      <button type="button" className="btn hero" data-sound="start" onClick={() => !leaving && start()} autoFocus>
        Start game
      </button>
      <p className="start-meta dim">{summary.join(' · ')}</p>
    </main>
  );
}
