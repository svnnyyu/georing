// The card shown when hovering (or tapping) a guessed city's marker (see docs/SPEC.md ->
// Guess info card): name and place, both population figures with the active one
// highlighted, and rank in the ring or distance outside it.

import { INFO_CARD } from '../../config.ts';
import { guessInfo } from '../../core/guessInfo.ts';
import type { GameState } from '../../core/types.ts';
import { formatKm, placeOf } from '../format.ts';
import { metroOf, PopulationLines } from './Population.tsx';
import { useGame } from '../state/GameProvider.tsx';
import type { MarkerRef } from '../state/overlay.ts';

export interface CardAnchor {
  ref: MarkerRef;
  x: number;
  y: number;
}

export function InfoCard({ game, anchor, bounds }: { game: GameState; anchor: CardAnchor; bounds: { width: number; height: number } }) {
  const { data, settings } = useGame();
  const regions = settings.subdivisions;
  if (anchor.ref.kind === 'start') {
    const c = data.byId.get(game.startId)!;
    return (
      <Card anchor={anchor} bounds={bounds}>
        <span className="name">
          {c.name} <span className="place">{placeOf(data, c.id, { regions })} · start city</span>
        </span>
        <PopulationLines cityPop={c.pop} metro={metroOf(data, c.id)} measure={game.settings.measure} />
      </Card>
    );
  }
  const info = guessInfo(data, game, anchor.ref.ring, anchor.ref.unitId);
  return (
    <Card anchor={anchor} bounds={bounds}>
      <span className="name">
        {info.name} <span className="place">{placeOf(data, info.unitId, { regions })}</span>
      </span>
      <PopulationLines cityPop={info.cityPop} metro={info.metro} measure={info.measure} />
      {info.rank && (
        <span>
          #{info.rank.position} of {info.rank.of} in this ring
        </span>
      )}
      {info.outsideKm !== null && <span className="text-outside">{formatKm(info.outsideKm)} outside</span>}
    </Card>
  );
}

const { width: CARD_W, height: CARD_H, offsetPx: OFFSET } = INFO_CARD;

function Card({
  anchor,
  bounds,
  children,
}: {
  anchor: CardAnchor;
  bounds: { width: number; height: number };
  children: React.ReactNode;
}) {
  // Keep the card on screen: flip to the left/top of the marker near the edges.
  const left = anchor.x + OFFSET + CARD_W > bounds.width ? Math.max(0, anchor.x - OFFSET - CARD_W) : anchor.x + OFFSET;
  const top = anchor.y + OFFSET + CARD_H > bounds.height ? Math.max(0, anchor.y - OFFSET - CARD_H) : anchor.y + OFFSET;
  return (
    <div className="info-card" style={{ left, top, width: CARD_W }} role="tooltip">
      {children}
    </div>
  );
}
