// City and metro population lines, with the one for the current measure highlighted.
// Used on the info card, for the start city in the play panel, and on the setup screen.

import type { GameData } from '../../core/data.ts';
import type { PopulationMeasure } from '../../core/types.ts';
import { formatPop } from '../format.ts';

export function PopulationLines({
  cityPop,
  metro,
  measure,
}: {
  cityPop: number;
  metro: { pop: number; members: number } | null;
  measure: PopulationMeasure;
}) {
  return (
    <span className="pop-lines">
      <span className={measure === 'city' ? 'pop active' : 'pop'}>
        <span>City</span>
        <span>{formatPop(cityPop)}</span>
      </span>
      {metro && (
        <span className={measure === 'metro' ? 'pop active' : 'pop'}>
          <span>Metro</span>
          <span>{formatPop(metro.pop)}</span>
        </span>
      )}
    </span>
  );
}

/** The metro a city belongs to, as shown on cards. */
export function metroOf(data: GameData, cityId: number): { pop: number; members: number } | null {
  const c = data.byId.get(cityId);
  const m = c?.metro === undefined ? undefined : data.metros.get(c.metro);
  return m ? { pop: m.pop, members: m.members } : null;
}
