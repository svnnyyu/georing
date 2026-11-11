// Temporary developer panel for milestone 4 (plain globe): fly-to buttons for tricky places
// and a readout of zoom, detail level and draw time. Shown only in development builds;
// replaced by the real game screens in milestone 5.

import { useState } from 'react';
import type { GlobeHandle } from '../globe/GlobeView.tsx';
import type { ViewInfo } from '../globe/globe.ts';
import './DevPanel.css';

const PLACES: { label: string; lat: number; lon: number }[] = [
  { label: 'Tokyo', lat: 35.69, lon: 139.69 },
  { label: 'New York', lat: 40.71, lon: -74.01 },
  { label: 'Lagos', lat: 6.45, lon: 3.39 },
  { label: 'Fiji (date line)', lat: -17.8, lon: 178.0 },
  { label: 'Longyearbyen (78°N)', lat: 78.22, lon: 15.65 },
  { label: 'McMurdo (78°S)', lat: -77.85, lon: 166.67 },
];

const RADII = [100, 300, 1000, 3000];

export function DevPanel({ globe, info }: { globe: React.RefObject<GlobeHandle | null>; info: ViewInfo | null }) {
  const [radius, setRadius] = useState(300);
  return (
    <div className="dev-panel">
      <div className="dev-label">DEV · GLOBE</div>
      <div className="dev-row">
        {RADII.map((r) => (
          <button key={r} className={r === radius ? 'dev-btn selected' : 'dev-btn'} onClick={() => setRadius(r)}>
            {r} km
          </button>
        ))}
      </div>
      <div className="dev-grid">
        {PLACES.map((p) => (
          <button key={p.label} className="dev-btn" onClick={() => void globe.current?.flyTo(p.lat, p.lon, radius)}>
            {p.label}
          </button>
        ))}
        <button className="dev-btn" onClick={() => void globe.current?.flyTo(20, 10, 20_000)}>
          Whole Earth
        </button>
      </div>
      {info && (
        <div className="dev-info">
          zoom {info.zoom.toFixed(2)} · {info.detail ?? 'loading'} · {info.frameMs.toFixed(1)} ms/frame
          <br />
          centre {info.center[1].toFixed(2)}, {info.center[0].toFixed(2)}
        </div>
      )}
    </div>
  );
}
