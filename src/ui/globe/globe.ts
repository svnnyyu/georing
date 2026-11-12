// The globe: an orthographic d3-geo projection drawn on a canvas, with north-up dragging
// and momentum, trackpad swipes, pinch/wheel zoom (d3-zoom), detail switching and smooth
// fly-to. Plain TypeScript, no React: GlobeView.tsx creates one and React never re-renders
// the map itself.

import { geoGraticule, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { pointer, pointers, select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import {
  BORDER_OPACITY,
  HINT_FADE_MS,
  HOME_ZOOM,
  IDLE_RESUME_MS,
  IDLE_SPIN_DEG_PER_SEC,
  SUBDIVISION_OPACITY,
  DETAIL_50M_MIN_ZOOM,
  GLOBE_START_VIEW,
  GRATICULE_STEP_DEG,
  INERTIA,
  MARKER_HIT_RADIUS_PX,
  MAX_CENTER_LAT,
  WHEEL,
  CLIP_MARGIN_DEG,
  RESAMPLE_PRECISION_PX,
  TAP_MAX_MOVE_PX,
  TAP_MAX_MS,
  VIEW_INFO_INTERVAL_MS,
} from '../../config.ts';
import type { Detail, WorldLayers } from '../../data/loadGeo.ts';
import { prepareLines, prepareWorld, visible, type Item, type PreparedWorld } from './layers.ts';
import { fadeAlpha, updateFading, type Fading } from './fade.ts';
import { drawOverlay, hitTest, type GlobeOverlay, type ProjectedMarker } from './overlay.ts';
import { flyPath, scaleExtent, scaleForRadius, wholeEarthScale, type View, type Viewport } from './camera.ts';
import { Sky } from './sky.ts';
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
  /** The pointer moved onto (id) or off (null) a marker. x, y in CSS px within the canvas. */
  onMarkerHover?: (id: string | null, x: number, y: number) => void;
  /** A tap or click: on a marker (id) or on empty globe (null). */
  onMarkerTap?: (id: string | null, x: number, y: number) => void;
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
  // Game layer: rings and markers
  private overlay: GlobeOverlay = { rings: [], markers: [] };
  private readonly born = new Map<string, number>();
  /** The country and area hints, with when they appeared or started to leave (they fade in
   *  when shown and fade out when the next ring clears them). */
  private hintCountry: Fading<string> | null = null;
  private hintArea: Fading<NonNullable<GlobeOverlay['hintArea']>> | null = null;
  /** How far the globe's centre sits below the screen's centre, as a share of the screen
   *  height (the start screen's "horizon"), animated between lowered and raised. */
  private lowered = true;
  private lift = { from: 1, to: 1, t0: 0, ms: 0 };
  /** Stars behind the globe. */
  private readonly sky = new Sky();
  private projected: ProjectedMarker[] = [];
  private hovered: string | null = null;
  private dragging = false;
  private press: { x: number; y: number; t: number } | null = null;
  private subdivisions: Item[] | null = null;
  // Idle spin (start screen)
  private idleSpin = false;
  private idleFrame = 0;
  private lastInteraction = 0;

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
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  /** Call when the canvas's CSS size changes. Keeps the current zoom level. */
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    const zoom = this.sized ? this.zoom : HOME_ZOOM; // first size: start at the home view
    this.sized = true;
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.dpr = dpr;
    this.canvas.width = Math.round(this.viewport.width * dpr);
    this.canvas.height = Math.round(this.viewport.height * dpr);
    this.theme = readGlobeTheme(); // the rest offset differs between phone and desktop
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

  /** Rings and markers to draw on top of the map. New answer markers get a glow pulse. */
  setOverlay(overlay: GlobeOverlay): void {
    const now = performance.now();
    const ids = new Set(overlay.markers.map((m) => m.id));
    for (const m of overlay.markers) {
      if ((m.kind === 'correct' || m.kind === 'hint') && !this.born.has(m.id)) this.born.set(m.id, now);
    }
    for (const id of this.born.keys()) if (!ids.has(id)) this.born.delete(id);
    this.hintCountry = updateFading(this.hintCountry, overlay.hintCountry, (cc) => cc, now);
    this.hintArea = updateFading(this.hintArea, overlay.hintArea, (a) => `${a.lat},${a.lon},${a.radiusKm}`, now);
    this.overlay = overlay;
    this.requestDraw();
  }

  /** Lower the globe to rest low on the screen like a horizon (start screen), or raise it to
   *  the middle (in a game). The map always fills the canvas, so no edge ever shows. */
  setLowered(on: boolean, durationMs = 0): void {
    if (on === this.lowered) return;
    this.lowered = on;
    const now = performance.now();
    this.lift = { from: this.liftAt(now), to: on ? 1 : 0, t0: now, ms: durationMs };
    this.requestDraw();
  }

  /** 1 = fully lowered, 0 = raised (eased). */
  private liftAt(now: number): number {
    const { from, to, t0, ms } = this.lift;
    const t = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
    const e = to < from ? 1 - (1 - t) ** 4 : t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2; // rise: ease-out; lower: ease-in-out
    return from + (to - from) * e;
  }

  /** State/province borders to draw, or null to hide them. */
  setSubdivisions(lines: import('geojson').FeatureCollection | null): void {
    this.subdivisions = lines ? prepareLines(lines) : null;
    this.requestDraw();
  }

  /** Slowly turn the globe (start screen). Pauses while the player interacts. */
  setIdleSpin(on: boolean): void {
    this.idleSpin = on;
    cancelAnimationFrame(this.idleFrame);
    this.idleFrame = 0;
    if (!on) return;
    let prev = performance.now();
    const step = (now: number) => {
      if (!this.idleSpin || this.destroyed) return;
      const dt = Math.min(64, now - prev);
      prev = now;
      const busy = this.dragging || this.inertia !== 0 || now - this.lastInteraction < IDLE_RESUME_MS;
      if (!busy) {
        const [lambda, phi, gamma] = this.projection.rotate();
        this.projection.rotate([lambda + (IDLE_SPIN_DEG_PER_SEC * dt) / 1000, phi, gamma]);
        this.draw();
      }
      this.idleFrame = requestAnimationFrame(step);
    };
    this.idleFrame = requestAnimationFrame(step);
  }

  /** Screen position (CSS px) of a marker drawn in the last frame, if visible. */
  markerPosition(id: string): { x: number; y: number } | null {
    return this.projected.find((p) => p.id === id) ?? null;
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
  flyTo(lat: number, lon: number, radiusKm?: number, durationMs?: number): Promise<void> {
    const scale = radiusKm === undefined ? this.projection.scale() : scaleForRadius(radiusKm, this.viewport);
    return this.flyToView({ center: [lon, lat], scale }, durationMs);
  }

  /** Fly back to the start screen's view (the whole Earth, a little larger: HOME_ZOOM). */
  flyHome(): Promise<void> {
    if (!this.sized) {
      // Not laid out yet: the first resize() sets the whole-Earth zoom.
      this.projection.rotate(rotationFor(GLOBE_START_VIEW.lon, GLOBE_START_VIEW.lat));
      return Promise.resolve();
    }
    return this.flyToView({
      center: [GLOBE_START_VIEW.lon, GLOBE_START_VIEW.lat],
      scale: HOME_ZOOM * wholeEarthScale(this.viewport),
    });
  }

  /** durationMs overrides the distance-based flight time. */
  private flyToView(to: View, durationMs?: number): Promise<void> {
    this.stopMotion();
    const path = flyPath(this.view, to, this.viewport);
    if (durationMs !== undefined) path.durationMs = durationMs;
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
    cancelAnimationFrame(this.idleFrame);
    this.selection.on('.zoom', null);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
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
    this.lastInteraction = performance.now();
    const [dx, dy] = wheelPanPixels(e);
    this.pan(dx, dy);
  };

  // Hover and tap on markers. Pointer events run alongside d3-zoom's mouse/touch handling.
  private localPoint(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragging || e.pointerType === 'touch') return;
    const [x, y] = this.localPoint(e);
    const id = hitTest(this.projected, x, y, MARKER_HIT_RADIUS_PX);
    this.canvas.style.cursor = id ? 'pointer' : '';
    if (id !== this.hovered) {
      this.hovered = id;
      this.options.onMarkerHover?.(id, x, y);
    }
  };

  private readonly onPointerLeave = (): void => {
    if (this.hovered) {
      this.hovered = null;
      this.options.onMarkerHover?.(null, 0, 0);
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    const [x, y] = this.localPoint(e);
    this.press = { x, y, t: performance.now() };
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    this.press = null;
    if (!press) return;
    const [x, y] = this.localPoint(e);
    if (Math.hypot(x - press.x, y - press.y) > TAP_MAX_MOVE_PX || performance.now() - press.t > TAP_MAX_MS) return;
    this.options.onMarkerTap?.(hitTest(this.projected, x, y, MARKER_HIT_RADIUS_PX), x, y);
  };

  private gestureStart(e: ZoomEvent): void {
    const source = e.sourceEvent as Event | null;
    if (!source) return; // programmatic
    this.lastInteraction = performance.now();
    this.dragging = source.type !== 'wheel';
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
    this.dragging = false;
    this.lastInteraction = performance.now();
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
    const { path, theme } = this;
    const { width, height } = this.viewport;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const now = performance.now();
    const lift = this.liftAt(now);
    const cy = height / 2 + lift * this.theme.globeRestOffset * height;
    this.projection.translate([width / 2, cy]);
    // Resampling (curving long edges) is on for the sphere and the graticule, whose lines are
    // long and would otherwise turn into straight chords. It's off for the map layers below:
    // their edges are already short, so it would only cost time.
    this.projection.precision(RESAMPLE_PRECISION_PX);
    // Clip to the small circle that just encloses the screen (not the whole hemisphere):
    // d3 drops everything beyond it before projecting, which is what keeps close zooms fast.
    const farthest = Math.hypot(width / 2, Math.max(cy, height - cy)); // to the farthest corner
    const cap = Math.asin(Math.min(1, farthest / this.projection.scale()));
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

    // 0. Stars, behind everything (the globe covers the ones behind it)
    this.sky.draw(ctx, theme, this.projection.rotate(), width, height, width / 2, cy);

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
      // 4b. State/province borders (Subdivisions setting), fainter when zoomed out
      if (this.subdivisions) {
        const { startZoom, fullAtZoom, max } = SUBDIVISION_OPACITY;
        const ts = Math.min(1, Math.max(0, (this.zoom - startZoom) / (fullAtZoom - startZoom)));
        trace(this.subdivisions);
        ctx.globalAlpha = max * ts;
        ctx.strokeStyle = theme.subdivisionLine;
        ctx.lineWidth = theme.subdivisionWidth;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // 5. Country hint: the answer's country outlined and tinted (under the rings)
    let fading = lift !== this.lift.to;
    const countryAlpha = fadeAlpha(this.hintCountry, now);
    if (this.hintCountry && countryAlpha === null) this.hintCountry = null;
    const hinted = world && this.hintCountry ? world.countries.get(this.hintCountry.value) : undefined;
    if (hinted && countryAlpha !== null) {
      const f = countryAlpha;
      fading ||= this.hintCountry!.at + HINT_FADE_MS > now;
      ctx.beginPath();
      for (const it of visible(hinted, this.view.center, cap)) path(it.geo);
      ctx.globalAlpha = theme.hintFillOpacity * f;
      ctx.fillStyle = theme.hint;
      ctx.fill();
      ctx.globalAlpha = f;
      ctx.strokeStyle = theme.hint;
      ctx.lineWidth = theme.hintWidth;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const areaAlpha = fadeAlpha(this.hintArea, now) ?? 0;
    if (this.hintArea && areaAlpha === 0 && this.hintArea.leaving) this.hintArea = null;
    if (this.hintArea) fading ||= this.hintArea.at + HINT_FADE_MS > now;
    // Rim of the globe
    this.projection.precision(RESAMPLE_PRECISION_PX);
    stroke({ type: 'Sphere' }, theme.coast, theme.coastWidth);

    // 6-8. Rings, area hint and markers
    const drawn = drawOverlay(
      ctx,
      path,
      this.projection,
      theme,
      { ...this.overlay, hintArea: this.hintArea?.value },
      { center: this.view.center, cap },
      this.born,
      now,
      areaAlpha,
    );
    this.projected = drawn.projected;
    if (drawn.animating || fading) this.requestDraw();

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
