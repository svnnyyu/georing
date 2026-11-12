// React wrapper around the canvas globe. React renders the <canvas> once; all drawing and
// interaction happen in Globe (globe.ts), so the map is never re-rendered by React. The
// game layer (rings, markers) is passed in as data and handed to the globe.

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { GLOBE_RISE_MS, INTRO } from '../../config.ts';
import { loadSubdivisions, loadWorld } from '../../data/loadGeo.ts';
import { Globe, type ViewInfo } from './globe.ts';
import type { GlobeOverlay } from './overlay.ts';
import './globe.css';

export interface GlobeHandle {
  /** Fly to a point; with radiusKm, zoom so that circle fills RING_FIT_FRACTION of the screen. */
  /** durationMs overrides the distance-based flight time. */
  flyTo(lat: number, lon: number, radiusKm?: number, durationMs?: number): Promise<void>;
  /** Fly back to the starting whole-Earth view. */
  /** Zoom out to fit a circle of radiusKm, keeping the current centre (never zooms in). */
  zoomOutTo(radiusKm: number, durationMs?: number): Promise<void>;
  flyHome(): Promise<void>;
  /** Where a marker was last drawn (CSS px within the globe), if visible. */
  markerPosition(id: string): { x: number; y: number } | null;
}

export interface GlobeViewProps {
  ref?: Ref<GlobeHandle>;
  overlay?: GlobeOverlay;
  /** Draw state/province borders. */
  subdivisions?: boolean;
  /** Slowly turn the globe (start screen). */
  idleSpin?: boolean;
  /** Rest the globe low on the screen like a horizon (start screen); it rises and sinks
   *  smoothly when this changes. */
  lowered?: boolean;
  /** Page load: the globe waits below the screen until this is true, then rises into view.
   *  (It waits for the city data, so the rise doesn't stutter while the data is unpacked.) */
  ready?: boolean;
  onViewChange?: (info: ViewInfo) => void;
  onMarkerHover?: (id: string | null, x: number, y: number) => void;
  onMarkerTap?: (id: string | null, x: number, y: number) => void;
  onError?: (error: Error) => void;
}

const EMPTY: GlobeOverlay = { rings: [], markers: [] };

export function GlobeView({
  ref,
  overlay = EMPTY,
  subdivisions = false,
  idleSpin = false,
  lowered = false,
  ready = true,
  onViewChange,
  onMarkerHover,
  onMarkerTap,
  onError,
}: GlobeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const callbacks = useRef({ onViewChange, onMarkerHover, onMarkerTap, onError });
  callbacks.current = { onViewChange, onMarkerHover, onMarkerTap, onError };
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

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
      onMarkerHover: (id, x, y) => callbacks.current.onMarkerHover?.(id, x, y),
      onMarkerTap: (id, x, y) => callbacks.current.onMarkerTap?.(id, x, y),
    });
    globeRef.current = globe;
    globe.setOverlay(overlayRef.current);
    // Page load: the globe waits below the screen until `ready`, then rises.
    globe.holdBelow(INTRO.globeFrom);
    // Marker labels use the web font; redraw once it has loaded.
    void document.fonts?.ready.then(() => globe.refreshTheme());
    loadWorld('110m')
      .then((w) => globe.setWorld('110m', w))
      .catch(fail);

    // Size the canvas now, then whenever it changes (the observer's first report can come late,
    // and never in some background browser views).
    const { width, height } = canvas.getBoundingClientRect();
    if (width > 0 && height > 0) globe.resize(width, height);
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

  useEffect(() => {
    globeRef.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    globeRef.current?.rise(reduced ? 0 : INTRO.globeMs);
  }, [ready]);

  useEffect(() => {
    globeRef.current?.setLowered(lowered, GLOBE_RISE_MS);
  }, [lowered]);

  useEffect(() => {
    globeRef.current?.setIdleSpin(idleSpin);
  }, [idleSpin]);

  useEffect(() => {
    if (!subdivisions) {
      globeRef.current?.setSubdivisions(null);
      return;
    }
    let live = true;
    loadSubdivisions()
      .then((fc) => live && globeRef.current?.setSubdivisions(fc))
      .catch((e: unknown) => callbacks.current.onError?.(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
  }, [subdivisions]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lon, radiusKm, durationMs) => globeRef.current?.flyTo(lat, lon, radiusKm, durationMs) ?? Promise.resolve(),
      zoomOutTo: (radiusKm, durationMs) => globeRef.current?.zoomOutTo(radiusKm, durationMs) ?? Promise.resolve(),
      flyHome: () => globeRef.current?.flyHome() ?? Promise.resolve(),
      markerPosition: (id) => globeRef.current?.markerPosition(id) ?? null,
    }),
    [],
  );

  return <canvas ref={canvasRef} className="globe-canvas" aria-label="Globe" />;
}
