// The game settings (see docs/SPEC.md -> Settings), shown in the Settings popup. Changes
// are saved straight away and apply to the next game.

import { CITIES_TO_FIND, RING_COUNT, RING_WIDTH_KM } from '../../config.ts';
import { resolveRingCount } from '../../core/game.ts';
import { metroOf, PopulationLines } from '../components/Population.tsx';
import type { PopulationMeasure } from '../../core/types.ts';
import { CitySearch } from '../components/CitySearch.tsx';
import { SectionLabel, Slider, Tiles, Toggle } from '../components/Controls.tsx';
import { formatKm, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

const range = (r: { min: number; max: number }) => Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i);
const COUNTS: (number | 'all')[] = [...range(RING_COUNT), 'all'];
const countLabel = (v: number | 'all') => (v === 'all' ? '∞' : String(v));
const TO_FIND = range(CITIES_TO_FIND);

export function SettingsForm() {
  const { data, settings, setSettings } = useGame();
  const set = (patch: Partial<typeof settings>) => setSettings({ ...settings, ...patch });
  const startCity = settings.startCityId === null ? null : data.byId.get(settings.startCityId);

  return (
    <div className="stack">
      <section>
        <SectionLabel>Start city</SectionLabel>
        <Tiles
          label="Start city"
          options={[
            { value: 'random', label: 'Random' },
            { value: 'pick', label: 'Pick a city' },
          ]}
          value={settings.startCityId === null ? 'random' : 'pick'}
          onChange={(v) => {
            if (v === 'random') set({ startCityId: null });
            else if (settings.startCityId === null) set({ startCityId: data.cities.find((c) => c.wellKnown)!.id });
          }}
        />
        {startCity && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <p className="small picked-city">
              {startCity.name} <span className="dim">{placeOf(data, startCity.id, { regions: settings.subdivisions })}</span>
            </p>
            <div className="spaced">
              <PopulationLines cityPop={startCity.pop} metro={metroOf(data, startCity.id)} measure={settings.measure} />
            </div>
            <CitySearch onPick={(id) => set({ startCityId: id })} />
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Rings</SectionLabel>
        <Slider
          label="Ring size"
          value={settings.ringWidthKm}
          values={RING_WIDTH_KM.options}
          format={formatKm}
          formatTick={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          onChange={(v) => set({ ringWidthKm: v })}
        />
        <Slider
          label="Number of rings"
          value={settings.ringCount}
          values={COUNTS}
          format={(v) => (v === 'all' ? `∞ (${resolveRingCount({ ...settings, ringCount: v })} rings)` : String(v))}
          formatTick={countLabel}
          onChange={(v) => set({ ringCount: v })}
        />
        <Slider
          label="Number of cities"
          value={settings.citiesToFind}
          values={TO_FIND}
          format={(v) => (v === 1 ? 'The biggest' : `Top ${v}`)}
          onChange={(v) => set({ citiesToFind: v })}
        />
      </section>

      <section>
        <SectionLabel>Population</SectionLabel>
        <Tiles<PopulationMeasure>
          label="Population measure"
          options={[
            { value: 'city', label: 'City' },
            { value: 'metro', label: 'Metro' },
          ]}
          value={settings.measure}
          onChange={(v) => set({ measure: v })}
        />
      </section>

      <section>
        <SectionLabel>Mode</SectionLabel>
        <Tiles
          label="Mode"
          options={[
            { value: 'population', label: 'Population' },
            { value: 'density', label: 'Density', disabled: true },
          ]}
          value="population"
          onChange={() => {}}
        />
      </section>

      <section>
        <SectionLabel>Options</SectionLabel>
        <div className="toggles">
          <Toggle label="Suggestions" checked={settings.suggestions} onChange={(v) => set({ suggestions: v })} />
          <Toggle label="Hints" checked={settings.hints} onChange={(v) => set({ hints: v })} />
          <Toggle label="Subdivisions" checked={settings.subdivisions} onChange={(v) => set({ subdivisions: v })} />
          <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => set({ sound: v })} soundAlways />
        </div>
      </section>
    </div>
  );
}
