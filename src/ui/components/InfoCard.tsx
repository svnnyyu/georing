// The card shown when hovering (or tapping) a guessed city's marker (see docs/SPEC.md ->
// Guess info card): name and place, both population figures with the active one
// highlighted, and rank in the ring or distance outside it.

import { useLayoutEffect, useRef } from 'react';
import { INFO_CARD } from '../../config.ts';
import { guessInfo } from '../../core/guessInfo.ts';
import type { GameState } from '../../core/types.ts';
import { formatKm, formatPop, placeOf } from '../format.ts';
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
          {c.name} <span className="place">{placeOf(data, c.id, { regions })}</span>
        </span>
        {/* Countries mode is about countries, so the start city's own figures aren't needed. */}
        {game.settings.mode !== 'countries' && (
          <PopulationLines cityPop={c.pop} metro={metroOf(data, c.id)} measure={game.settings.measure} />
        )}
      </Card>
    );
  }
  const info = guessInfo(data, game, anchor.ref.ring, anchor.ref.unitId);
  const area = anchor.ref.area;
  return (
    <Card anchor={anchor} bounds={bounds}>
      <span className="name">
        {area ? (
          // A territory's label: its own name, and the country its people count toward.
          <>
            {data.countries[area]?.name ?? area} <span className="place">{info.name}</span>
          </>
        ) : (
          <>
            {info.name} <span className="place">{placeOf(data, info.unitId, { regions })}</span>
          </>
        )}
      </span>
      {info.isCountry ? (
        // Countries mode: the people inside this ring (what it's ranked by), and the whole
        // country for scale.
        <div className="pop-lines">
          {info.rank && (
            <span className="pop active">
              <span>Ring</span>
              <span>{formatPop(info.pop)}</span>
            </span>
          )}
          <span className="pop">
            <span>Total</span>
            <span>{formatPop(info.cityPop)}</span>
          </span>
        </div>
      ) : (
        <PopulationLines cityPop={info.cityPop} metro={info.metro} measure={info.measure} />
      )}
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
  // The card is as wide as its widest line (up to CARD_W). Keep it on screen: flip to the
  // left/top of the marker near the edges, using its measured size once it is laid out.
  const ref = useRef<HTMLDivElement>(null);
  const place = (w: number, h: number) => ({
    left: anchor.x + OFFSET + w > bounds.width ? Math.max(0, anchor.x - OFFSET - w) : anchor.x + OFFSET,
    top: anchor.y + OFFSET + h > bounds.height ? Math.max(0, anchor.y - OFFSET - h) : anchor.y + OFFSET,
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { left, top } = place(el.offsetWidth, el.offsetHeight);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });
  const { left, top } = place(CARD_W, CARD_H);
  return (
    <div ref={ref} className="info-card" style={{ left, top, maxWidth: CARD_W }} role="tooltip">
      {children}
    </div>
  );
}
