// The start screen: title, tagline, a one-line summary of the settings, and the Start button,
// centred over the slowly turning globe that rests low on the screen like a horizon. When a
// game starts it plays its exit animation ("leaving") before it is removed.

import { countryName } from '../../core/data.ts';
import { formatKm } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

export function StartScreen({ leaving }: { leaving: boolean }) {
  const { data, settings, start } = useGame();
  const startCity = settings.startCityId === null ? null : data.byId.get(settings.startCityId);
  const summary = [
    startCity ? `From ${startCity.name}, ${countryName(data, startCity.cc)}` : 'Random start city',
    `${settings.ringCount} ring${settings.ringCount > 1 ? 's' : ''} of ${formatKm(settings.ringWidthKm)}`,
    settings.measure === 'metro' ? 'Metro areas' : 'City populations',
  ];
  return (
    <main className={leaving ? 'start-screen leaving' : 'start-screen'} aria-hidden={leaving}>
      <h1 className="hero-title">GeoRing</h1>
      <p className="tagline">Find the most populous city in each ring</p>
      <button type="button" className="btn hero" onClick={() => !leaving && start()} autoFocus>
        Start game
      </button>
      <p className="start-meta dim">{summary.join(' · ')}</p>
    </main>
  );
}
