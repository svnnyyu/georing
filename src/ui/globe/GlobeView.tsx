// React wrapper around the canvas globe. React renders the <canvas> once; all drawing and
// interaction happen in Globe (globe.ts), so the map is never re-rendered by React.

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { loadWorld } from '../../data/loadGeo.ts';
import { Globe, type ViewInfo } from './globe.ts';
import './globe.css';

export interface GlobeHandle {
  /** Fly to a point; with radiusKm, zoom so that circle fills RING_FIT_FRACTION of the screen. */
  flyTo(lat: number, lon: number, radiusKm?: number): Promise<void>;
}

export interface GlobeViewProps {
  ref?: Ref<GlobeHandle>;
  onViewChange?: (info: ViewInfo) => void;
  onError?: (error: Error) => void;
}

export function GlobeView({ ref, onViewChange, onError }: GlobeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const callbacks = useRef({ onViewChange, onError });
  callbacks.current = { onViewChange, onError };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fail = (e: unknown) => callbacks.current.onError?.(e instanceof Error ? e : new Error(String(e)));
    const globe = new Globe(canvas, {
      onNeedDetail: (detail) =>
        loadWorld(detail)
          .then((w) => globe.setWorld(detail, w))
          .catch(fail),
      onViewChange: (info) => callbacks.current.onViewChange?.(info),
    });
    globeRef.current = globe;
    loadWorld('110m')
      .then((w) => globe.setWorld('110m', w))
      .catch(fail);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) globe.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      globe.destroy();
      globeRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lon, radiusKm) => globeRef.current?.flyTo(lat, lon, radiusKm) ?? Promise.resolve(),
    }),
    [],
  );

  return <canvas ref={canvasRef} className="globe-canvas" aria-label="Globe" />;
}
