// Milestone 4: the plain globe, full screen. A temporary dev panel exercises fly-to and
// shows draw times. Game screens arrive in milestone 5.

import { useRef, useState } from 'react';
import { DevPanel } from './ui/components/DevPanel.tsx';
import { GlobeView, type GlobeHandle } from './ui/globe/GlobeView.tsx';
import type { ViewInfo } from './ui/globe/globe.ts';
import './App.css';

export default function App() {
  const globe = useRef<GlobeHandle>(null);
  const [info, setInfo] = useState<ViewInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="app">
      <GlobeView ref={globe} onViewChange={setInfo} onError={(e) => setError(e.message)} />
      {import.meta.env.DEV && <DevPanel globe={globe} info={info} />}
      {error && <div className="app-error">{error}</div>}
    </main>
  );
}
