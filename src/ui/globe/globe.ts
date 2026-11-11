// The globe: an orthographic d3-geo projection drawn on a canvas, with north-up dragging
// and momentum, trackpad swipes, pinch/wheel zoom (d3-zoom), detail switching and smooth
// fly-to. Plain TypeScript, no React: GlobeView.tsx creates one and React never re-renders
// the map itself.

import { geoGraticule, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { pointer, pointers, select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import {
  BORDER_OPACITY,
  DETAIL_50M_MIN_ZOOM,
  GLOBE_START_VIEW,
  GRATICULE_STEP_DEG,
  INERTIA,
  MAX_CENTER_LAT,
  WHEEL,
  CLIP_MARGIN_DEG,
  RESAMPLE_PRECISION_PX,
  VIEW_INFO_INTERVAL_MS,
} from '../../config.ts';
import type { Detail, WorldLayers } from '../../data/loadGeo.ts';
import { prepareWorld, visible, type PreparedWorld } from './layers.ts';
import { flyPath, scaleExtent, scaleForRadius, wholeEarthScale, type View, type Viewport } from './camera.ts';
import { readGlobeTheme, type GlobeTheme } from './theme.ts';
import {
  decay,
  isTrackpadPan,
  panRotation,
  rotationFor,
  VelocityTracker,
  wheelPanPixels,
  type Rotation,
} from './motion.ts';

export interface ViewInfo {
  /** Projection scale relative to the whole-Earth view. */
  zoom: number;
  detail: Detail | null;
  center: [number, number];
  /** Time the last frame took to draw, in ms. */
  frameMs: number;
}

export interface GlobeOptions {
  /** Called when a more detailed layer is first needed; call setWorld() when it has loaded. */
  onNeedDetail?: (detail: Detail) => void;
  onViewChange?: (info: ViewInfo) => void;
}

type ZoomEvent = D3ZoomEvent<HTMLCanvasElement, unknown>;

export class Globe {
  private readonly projection = geoOrthographic().clipAngle(90).precision(RESAMPLE_PRECISION_PX);
  private readonly ctx: CanvasRenderingContext2D;
  private readonly path = geoPath();
  private readonly graticule = geoGraticule().step([GRATICULE_STEP_DEG, GRATICULE_STEP_DEG])();
  private readonly selection: Selection<HTMLCanvasElement, unknown, null, undefined>;
  private readonly zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>;
  private readonly worlds: Partial<Record<Detail, PreparedWorld>> = {};
  private readonly requested = new Set<Detail>();
  private theme: GlobeTheme;
  private viewport: Viewport = { width: 1, height: 1 };
  private dpr = 1;
  private sized = false;
  private frame = 0;
  private flight = 0;
  private lastInfo = 0;
  private lastFrameMs = 0;
  private destroyed = false;
  // Gesture state
  private last: [number, number] | null = null;
  private pointerCount = 0;
  private readonly tracker = new VelocityTracker();
  private inertia = 0;
  // Wheel classification: one decision per burst of wheel events (see WHEEL.burstGapMs)
  private wheelEvent: WheelEvent | null = null;
  private wheelPan = false;
  private wheelTime = -Infinity;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: GlobeOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.path.context(ctx);
    this.theme = readGlobeTheme();
    this.projection.rotate(rotationFor(GLOBE_START_VIEW.lon, GLOBE_START_VIEW.lat));
    this.selection = select(canvas);
    this.zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
      .filter((event: Event) => this.acceptsZoomEvent(event))
      .on('start', (e: ZoomEvent) => this.gestureStart(e))
      .on('zoom', (e: ZoomEvent) => this.gestureMove(e))
      .on('end', (e: ZoomEvent) => this.gestureEnd(e));
    this.selection.call(this.zoomBehavior);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Call when the canvas's CSS size changes. Keeps the current zoom level. */
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    const zoom = this.sized ? this.zoom : 1; // first size: start at the whole-Earth view
    this.sized = true;
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.dpr = dpr;
    this.canvas.width = Math.round(this.viewport.width * dpr);
    this.canvas.height = Math.round(this.viewport.height * dpr);
    this.projection.translate([this.viewport.width / 2, this.viewport.height / 2]);
    this.projection.clipExtent([
      [0, 0],
      [this.viewport.width, this.viewport.height],
    ]);
    const extent = scaleExtent(this.viewport);
    this.zoomBehavior.scaleExtent(extent);
    this.setScale(Math.min(extent[1], Math.max(extent[0], (zoom || 1) * wholeEarthScale(this.viewport))));
    this.requestDraw();
  }

  setWorld(detail: Detail, world: WorldLayers): void {
    this.worlds[detail] = prepareWorld(world);
    this.requestDraw();
  }

  /** Re-read colours from tokens.css (e.g. after a theme change). */
  refreshTheme(): void {
    this.theme = readGlobeTheme();
    this.requestDraw();
  }

  /** Zoom relative to the whole-Earth view (1 = whole globe fits). */
  get zoom(): number {
    return this.projection.scale() / wholeEarthScale(this.viewport);
  }

  get view(): View {
    const [l, p] = this.projection.rotate();
    return { center: [-l, -p], scale: this.projection.scale() };
  }

  /** Smoothly move the camera to centre on (lat, lon). With radiusKm, zoom so a circle of
   *  that radius fills RING_FIT_FRACTION of the shorter side; without it, keep the zoom.
   *  Resolves when the flight ends (or is interrupted by the player). */
  flyTo(lat: number, lon: number, radiusKm?: number): Promise<void> {
    this.stopMotion();
    const to: View = {
      center: [lon, lat],
      scale: radiusKm === undefined ? this.projection.scale() : scaleForRadius(radiusKm, this.viewport),
    };
    const path = flyPath(this.view, to, this.viewport);
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (this.destroyed) return resolve();
        const t = Math.min(1, (now - t0) / path.durationMs);
        const v = path.at(t);
        this.projection.rotate(rotationFor(v.center[0], v.center[1]));
        this.setScale(v.scale);
        this.draw();
        if (t < 1) this.flight = requestAnimationFrame(step);
        else resolve();
      };
      this.flight = requestAnimationFrame(step);
      this.interruptFlight = () => {
        cancelAnimationFrame(this.flight);
        resolve();
      };
    });
  }

  private interruptFlight: () => void = () => {};

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.infoTimer);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.flight);
    cancelAnimationFrame(this.inertia);
    this.selection.on('.zoom', null);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  // --- Interaction ---------------------------------------------------------------------

  /** Set the projection scale and keep d3-zoom's stored transform in step with it. */
  private setScale(scale: number): void {
    this.projection.scale(scale);
    this.selection.property('__zoom', zoomIdentity.scale(scale));
  }

  private pointerCentre(event: Event): [number, number] | null {
    const pts = pointers(event, this.canvas);
    this.pointerCount = pts.length;
    if (pts.length === 0) return null;
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return [x, y];
  }

  /** Stop any fly-to or momentum, e.g. when the player grabs the globe. */
  private stopMotion(): void {
    this.interruptFlight();
    cancelAnimationFrame(this.inertia);
    this.inertia = 0;
  }

  /** Move the view as if the globe were dragged by (dx, dy) pixels. North stays up. */
  private pan(dx: number, dy: number): void {
    this.projection.rotate(panRotation(this.projection.rotate() as Rotation, dx, dy, this.projection.scale()));
    this.requestDraw();
  }

  /** Change the scale while keeping the place under the pointer in place (as far as a
   *  north-up view allows). */
  private zoomAt(p: [number, number], scale: number): void {
    const before = this.projection.invert?.(p);
    this.projection.scale(scale);
    const after = this.projection.invert?.(p);
    if (!before || !after || ![...before, ...after].every(Number.isFinite)) return;
    const [lambda, phi] = this.projection.rotate();
    const dLon = ((((after[0] - before[0] + 180) % 360) + 360) % 360) - 180;
    const lat = Math.max(-MAX_CENTER_LAT, Math.min(MAX_CENTER_LAT, -phi + before[1] - after[1]));
    this.projection.rotate([lambda + dLon, -lat, 0]);
  }

  /** Is this wheel event a trackpad swipe (pan)? Decided once per burst of events, so a
   *  swipe's momentum tail never turns into zooming, and cached per event because both
   *  d3-zoom's filter and onWheel ask. */
  private wheelIsPan(e: WheelEvent): boolean {
    if (this.wheelEvent === e) return this.wheelPan;
    const continuing = e.timeStamp - this.wheelTime < WHEEL.burstGapMs;
    this.wheelPan = !e.ctrlKey && (continuing ? this.wheelPan : isTrackpadPan(e));
    this.wheelEvent = e;
    this.wheelTime = e.timeStamp;
    return this.wheelPan;
  }

  /** d3-zoom handles drags, touch, pinches and zooming wheels; trackpad swipes are ours. */
  private acceptsZoomEvent(event: Event): boolean {
    if (event.type === 'wheel') return !this.wheelIsPan(event as WheelEvent);
    const e = event as MouseEvent;
    return !e.ctrlKey && !e.button;
  }

  /** Two-finger trackpad swipes pan the globe. macOS keeps sending wheel events with
   *  shrinking deltas after the fingers lift, which gives swipes their momentum. */
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.wheelIsPan(e)) return;
    e.preventDefault();
    this.stopMotion();
    const [dx, dy] = wheelPanPixels(e);
    this.pan(dx, dy);
  };

  private gestureStart(e: ZoomEvent): void {
    const source = e.sourceEvent as Event | null;
    if (!source) return; // programmatic
    this.stopMotion();
    this.tracker.reset();
    this.last = source.type === 'wheel' ? null : this.pointerCentre(source);
    if (this.last) this.tracker.add(performance.now(), this.last[0], this.last[1]);
  }

  private gestureMove(e: ZoomEvent): void {
    const source = e.sourceEvent as Event | null;
    const scale = e.transform.k;
    if (!source) {
      this.projection.scale(scale); // e.g. double-click zoom transition
    } else if (source.type === 'wheel' || source.type === 'dblclick') {
      this.zoomAt(pointer(source, this.canvas), scale);
    } else {
      this.projection.scale(scale); // pinch
      const before = this.pointerCount;
      const p = this.pointerCentre(source);
      if (p) {
        if (this.last && this.pointerCount === before) this.pan(p[0] - this.last[0], p[1] - this.last[1]);
        else this.tracker.reset(); // a finger was added or lifted: start measuring again
        this.last = p;
        this.tracker.add(performance.now(), p[0], p[1]);
      }
    }
    this.requestDraw();
  }

  /** On release, a drag that was still moving keeps spinning and slows down. */
  private gestureEnd(e: ZoomEvent): void {
    const source = e.sourceEvent as Event | null;
    this.last = null;
    if (!source || source.type === 'wheel') return;
    let velocity = this.tracker.velocity(performance.now());
    this.tracker.reset();
    if (velocity[0] === 0 && velocity[1] === 0) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - prev);
      prev = now;
      this.pan(velocity[0] * dt, velocity[1] * dt);
      velocity = decay(velocity, dt);
      this.inertia = Math.hypot(...velocity) > INERTIA.stopSpeed ? requestAnimationFrame(step) : 0;
    };
    this.inertia = requestAnimationFrame(step);
  }

  // --- Drawing -------------------------------------------------------------------------

  private requestDraw(): void {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** The best loaded detail level for the current zoom, requesting better ones as needed. */
  private pickDetail(): Detail | null {
    const want: Detail = this.zoom >= DETAIL_50M_MIN_ZOOM ? '50m' : '50m-lo';
    if (!this.worlds[want] && !this.requested.has(want)) {
      this.requested.add(want);
      this.options.onNeedDetail?.(want);
    }
    const order: Detail[] = want === '50m' ? ['50m', '50m-lo', '110m'] : ['50m-lo', '50m', '110m'];
    return order.find((d) => this.worlds[d]) ?? null;
  }

  private draw(): void {
    const start = performance.now();
    const { ctx, path, theme } = this;
    const { width, height } = this.viewport;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Resampling (curving long edges) is on for the sphere and the graticule, whose lines are
    // long and would otherwise turn into straight chords. It's off for the map layers below:
    // their edges are already short, so it would only cost time.
    this.projection.precision(RESAMPLE_PRECISION_PX);
    // Clip to the small circle that just encloses the screen (not the whole hemisphere):
    // d3 drops everything beyond it before projecting, which is what keeps close zooms fast.
    const halfDiagonal = Math.hypot(width, height) / 2;
    const cap = Math.asin(Math.min(1, halfDiagonal / this.projection.scale()));
    this.projection.clipAngle(Math.min(90, (cap * 180) / Math.PI + CLIP_MARGIN_DEG));
    path.projection(this.projection);

    const stroke = (obj: GeoPermissibleObjects, color: string, lineWidth: number) => {
      ctx.beginPath();
      path(obj);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };
    const fillShape = (obj: GeoPermissibleObjects, color: string) => {
      ctx.beginPath();
      path(obj);
      ctx.fillStyle = color;
      ctx.fill();
    };

    // 1. Ocean and graticule
    fillShape({ type: 'Sphere' }, theme.ocean);
    stroke(this.graticule, theme.graticule, theme.graticuleWidth);

    this.projection.precision(0);
    const detail = this.pickDetail();
    const world = detail ? this.worlds[detail] : undefined;
    if (world) {
      // Only shapes that can be on screen: the visible cap around the view centre.
      const center = this.view.center;
      const trace = (items: PreparedWorld['land']) => {
        ctx.beginPath();
        for (const it of visible(items, center, cap)) path(it.geo);
      };
      // 2. Land, then coastlines (drawn separately so cut lines at 180° don't show)
      trace(world.land);
      ctx.fillStyle = theme.land;
      ctx.fill();
      // Outline in the land colour too: hides hairline gaps along those cuts.
      ctx.strokeStyle = theme.land;
      ctx.lineWidth = theme.coastWidth;
      ctx.stroke();
      trace(world.coast);
      ctx.strokeStyle = theme.coast;
      ctx.lineWidth = theme.coastWidth;
      ctx.stroke();
      // 3. Lakes
      trace(world.lakes);
      ctx.fillStyle = theme.ocean;
      ctx.fill();
      ctx.stroke();
      // 4. Country borders: always shown, fainter when zoomed out
      const t = Math.min(1, Math.max(0, (this.zoom - 1) / (BORDER_OPACITY.fullAtZoom - 1)));
      trace(world.borders);
      ctx.globalAlpha = BORDER_OPACITY.min + (BORDER_OPACITY.max - BORDER_OPACITY.min) * t;
      ctx.strokeStyle = theme.countryLine;
      ctx.lineWidth = theme.borderWidth;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Rim of the globe
    this.projection.precision(RESAMPLE_PRECISION_PX);
    stroke({ type: 'Sphere' }, theme.coast, theme.coastWidth);

    this.lastFrameMs = performance.now() - start;
    this.reportView(detail);
  }

  /** Reports the view at most every VIEW_INFO_INTERVAL_MS, always including the last frame. */
  private reportView(detail: Detail | null): void {
    const report = this.options.onViewChange;
    if (!report) return;
    const send = () => {
      this.lastInfo = performance.now();
      this.infoTimer = 0;
      report({ zoom: this.zoom, detail, center: this.view.center, frameMs: this.lastFrameMs });
    };
    clearTimeout(this.infoTimer);
    const wait = VIEW_INFO_INTERVAL_MS - (performance.now() - this.lastInfo);
    if (wait <= 0) send();
    else this.infoTimer = window.setTimeout(send, wait);
  }

  private infoTimer = 0;
}
