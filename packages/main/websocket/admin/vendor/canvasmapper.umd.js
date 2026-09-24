(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined'
        ? factory(exports)
        : typeof define === 'function' && define.amd
          ? define(['exports'], factory)
          : ((global = typeof globalThis !== 'undefined' ? globalThis : global || self),
            factory((global.CanvasMapper = {})));
})(this, function (exports) {
    'use strict';

    /** Clamp a value into [min, max] */
    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
    const Easings = {
        easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    };

    /** Mouse: left-button drag pans, wheel zooms, quick click taps */
    class MouseStrategy {
        constructor() {
            this.target = null;
            this.handlers = null;
            this.dragging = false;
            this.last = { x: 0, y: 0 };
            this.moved = 0;
            this.lastTime = 0;
            this.velocity = { x: 0, y: 0 };
            this.onDown = (e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                this.dragging = true;
                this.moved = 0;
                this.velocity = { x: 0, y: 0 };
                this.last = { x: e.clientX, y: e.clientY };
                this.lastTime = performance.now();
                this.target.setPointerCapture(e.pointerId);
                this.target.style.cursor = 'grabbing';
                this.handlers.onPanStart();
            };
            this.onMove = (e) => {
                if (!this.dragging || e.pointerType !== 'mouse') return;
                const dx = e.clientX - this.last.x;
                const dy = e.clientY - this.last.y;
                this.moved += Math.abs(dx) + Math.abs(dy);
                // Smoothed instantaneous velocity, used for inertia on release
                const now = performance.now();
                const dt = now - this.lastTime;
                if (dt > 0) {
                    this.velocity = {
                        x: this.velocity.x * 0.2 + (dx / dt) * 0.8,
                        y: this.velocity.y * 0.2 + (dy / dt) * 0.8,
                    };
                }
                this.lastTime = now;
                this.last = { x: e.clientX, y: e.clientY };
                this.handlers.onPan(dx, dy);
            };
            this.onUp = (e) => {
                if (e.pointerType !== 'mouse' || !this.dragging) return;
                this.dragging = false;
                this.target.style.cursor = 'grab';
                if (this.moved < 5) this.handlers.onTap(this.toLocal(e));
                else this.handlers.onPanEnd(this.velocity);
            };
            this.onWheel = (e) => {
                e.preventDefault();
                // Normalize line/pixel delta modes into zoom units
                const delta = clamp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002), -0.6, 0.6);
                this.handlers.onZoom(delta, this.toLocal(e));
            };
        }
        attach(target, handlers) {
            this.target = target;
            this.handlers = handlers;
            target.style.cursor = 'grab';
            target.addEventListener('pointerdown', this.onDown);
            target.addEventListener('pointermove', this.onMove);
            target.addEventListener('pointerup', this.onUp);
            target.addEventListener('pointercancel', this.onUp);
            target.addEventListener('wheel', this.onWheel, { passive: false });
        }
        detach() {
            const t = this.target;
            if (!t) return;
            t.removeEventListener('pointerdown', this.onDown);
            t.removeEventListener('pointermove', this.onMove);
            t.removeEventListener('pointerup', this.onUp);
            t.removeEventListener('pointercancel', this.onUp);
            t.removeEventListener('wheel', this.onWheel);
            this.target = null;
            this.handlers = null;
        }
        toLocal(e) {
            const rect = this.target.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
    }

    /** Touch / pen: one finger pans, two fingers pinch-zoom, quick single-finger taps fire onTap */
    class TouchStrategy {
        constructor() {
            this.target = null;
            this.handlers = null;
            this.pointers = new Map();
            this.prevMid = null;
            this.prevDist = 0;
            // Tap detection
            this.tapStart = null;
            this.tapMoved = false;
            this.TAP_DISTANCE_SQ = 64; // 8px threshold
            this.TAP_MAX_MS = 500;
            this.onDown = (e) => {
                if (e.pointerType === 'mouse') return;
                if (this.pointers.size === 0) {
                    this.handlers.onPanStart();
                    // Start tracking a potential tap (only for the very first finger)
                    this.tapStart = {
                        p: this.toLocal(e),
                        t: performance.now(),
                        pointerId: e.pointerId,
                    };
                    this.tapMoved = false;
                } else {
                    // Any extra finger invalidates the tap (pinch in progress)
                    this.tapStart = null;
                    this.tapMoved = true;
                }
                this.pointers.set(e.pointerId, this.toLocal(e));
                this.prevMid = null;
                this.prevDist = 0;
            };
            this.onMove = (e) => {
                if (e.pointerType === 'mouse' || !this.pointers.has(e.pointerId)) return;
                const next = this.toLocal(e);
                const prev = this.pointers.get(e.pointerId);
                this.pointers.set(e.pointerId, next);
                // Any pointer moving more than the threshold kills the tap
                if (this.tapStart && this.tapStart.pointerId === e.pointerId) {
                    const dx = next.x - this.tapStart.p.x;
                    const dy = next.y - this.tapStart.p.y;
                    if (dx * dx + dy * dy > this.TAP_DISTANCE_SQ) this.tapMoved = true;
                } else if (this.tapStart) {
                    this.tapMoved = true;
                }
                if (this.pointers.size === 1) {
                    this.handlers.onPan(next.x - prev.x, next.y - prev.y);
                    return;
                }
                if (this.pointers.size === 2) {
                    const [a, b] = [...this.pointers.values()];
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    if (this.prevMid) {
                        this.handlers.onPan(mid.x - this.prevMid.x, mid.y - this.prevMid.y);
                    }
                    if (this.prevDist > 0 && dist > 0) {
                        // log2 turns a distance ratio into zoom units: 2x spread = +1 zoom
                        this.handlers.onZoom(Math.log2(dist / this.prevDist), mid);
                    }
                    this.prevMid = mid;
                    this.prevDist = dist;
                }
            };
            this.onUp = (e) => {
                if (e.pointerType === 'mouse') return;
                // Detect tap: single finger, barely moved, released quickly
                if (
                    this.tapStart &&
                    this.tapStart.pointerId === e.pointerId &&
                    !this.tapMoved &&
                    performance.now() - this.tapStart.t < this.TAP_MAX_MS
                ) {
                    this.handlers.onTap(this.tapStart.p);
                }
                if (e.pointerId === this.tapStart?.pointerId) this.tapStart = null;
                this.pointers.delete(e.pointerId);
                this.prevMid = null;
                this.prevDist = 0;
                if (this.pointers.size === 0) {
                    this.handlers.onPanEnd({ x: 0, y: 0 });
                    this.tapMoved = false;
                }
            };
        }
        attach(target, handlers) {
            this.target = target;
            this.handlers = handlers;
            // We handle gestures ourselves; disable browser scroll/zoom on the canvas
            target.style.touchAction = 'none';
            target.addEventListener('pointerdown', this.onDown);
            target.addEventListener('pointermove', this.onMove);
            target.addEventListener('pointerup', this.onUp);
            target.addEventListener('pointercancel', this.onUp);
        }
        detach() {
            const t = this.target;
            if (!t) return;
            t.removeEventListener('pointerdown', this.onDown);
            t.removeEventListener('pointermove', this.onMove);
            t.removeEventListener('pointerup', this.onUp);
            t.removeEventListener('pointercancel', this.onUp);
            this.target = null;
            this.handlers = null;
        }
        toLocal(e) {
            const rect = this.target.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
    }

    /**
     * Binds input strategies to the canvas.
     * Mouse and touch strategies coexist: each filters its own pointer type.
     */
    class InputController {
        constructor(target, handlers) {
            this.strategies = [new MouseStrategy(), new TouchStrategy()];
            for (const strategy of this.strategies) strategy.attach(target, handlers);
        }
        destroy() {
            for (const strategy of this.strategies) strategy.detach();
        }
    }

    /**
     * Camera holds the current view: world-space center + fractional zoom.
     * All coordinate math of the engine lives here.
     */
    class Camera {
        constructor(options = {}) {
            this.center = { x: 0, y: 0 };
            this.zoom = 0;
            this.minZoom = options.minZoom ?? 0;
            this.maxZoom = options.maxZoom ?? 18;
        }
        /** Pixels per world unit at the current zoom */
        getScale() {
            return Math.pow(2, this.zoom);
        }
        getViewState() {
            return { x: this.center.x, y: this.center.y, zoom: this.zoom };
        }
        setViewState(state) {
            if (state.x !== undefined) this.center.x = state.x;
            if (state.y !== undefined) this.center.y = state.y;
            if (state.zoom !== undefined) this.zoom = clamp(state.zoom, this.minZoom, this.maxZoom);
        }
        /** Shift the view by a screen-space delta (dragging) */
        panByScreen(dx, dy) {
            const scale = this.getScale();
            // Dragging right must move the map right => center moves left
            this.center.x -= dx / scale;
            this.center.y -= dy / scale;
        }
        /**
         * Change zoom keeping the world point under `anchor` (screen px) fixed.
         * This is what makes zoom feel "aimed at the cursor".
         */
        zoomAt(anchor, view, newZoom) {
            const world = this.screenToWorld(anchor, view);
            this.zoom = clamp(newZoom, this.minZoom, this.maxZoom);
            const scale = this.getScale();
            this.center = {
                x: world.x - (anchor.x - view.width / 2) / scale,
                y: world.y - (anchor.y - view.height / 2) / scale,
            };
        }
        worldToScreen(world, view) {
            const scale = this.getScale();
            return {
                x: (world.x - this.center.x) * scale + view.width / 2,
                y: (world.y - this.center.y) * scale + view.height / 2,
            };
        }
        screenToWorld(screen, view) {
            const scale = this.getScale();
            return {
                x: (screen.x - view.width / 2) / scale + this.center.x,
                y: (screen.y - view.height / 2) / scale + this.center.y,
            };
        }
    }

    /**
     * Lightweight event emitter for CanvasMapper
     */
    class EventEmitter {
        constructor() {
            this.events = new Map();
        }
        /** Subscribe to an event */
        on(event, callback) {
            if (!this.events.has(event)) {
                this.events.set(event, new Set());
            }
            this.events.get(event).add(callback);
        }
        /** Unsubscribe from an event */
        off(event, callback) {
            const callbacks = this.events.get(event);
            if (callbacks) {
                callbacks.delete(callback);
            }
        }
        /** Emit an event with data */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event payload is user-defined
        emit(event, ...args) {
            const callbacks = this.events.get(event);
            if (callbacks) {
                callbacks.forEach((callback) => callback(...args));
            }
        }
        /** Subscribe to an event once */
        once(event, callback) {
            const wrapper = (...args) => {
                callback(...args);
                this.off(event, wrapper);
            };
            this.on(event, wrapper);
        }
    }

    /**
     * Draw pipeline: background -> debug grid -> tiles.
     */
    class Renderer {
        constructor(viewport, camera, tiles = null, layers = null, vectors = []) {
            this.viewport = viewport;
            this.camera = camera;
            this.tiles = tiles;
            this.layers = layers;
            this.vectors = vectors;
        }
        render() {
            const { ctx } = this.viewport;
            const size = this.viewport.size;
            this.viewport.clear();
            ctx.fillStyle = '#0f1420';
            ctx.fillRect(0, 0, size.width, size.height);
            this.drawGrid();
            const state = this.camera.getViewState();
            if (this.tiles) {
                this.tiles.update(state, size);
                this.tiles.draw(ctx, state, size);
            }
            for (const v of this.vectors) v.draw(ctx, state, size);
            if (this.layers) {
                this.layers.draw(ctx, this.camera, size);
            }
        }
        /** Infinite world-space grid, useful while tiles are loading */
        drawGrid() {
            const { ctx } = this.viewport;
            const size = this.viewport.size;
            const step = 100;
            const topLeft = this.camera.screenToWorld({ x: 0, y: 0 }, size);
            const bottomRight = this.camera.screenToWorld({ x: size.width, y: size.height }, size);
            ctx.strokeStyle = 'rgba(127, 209, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
                const s = this.camera.worldToScreen({ x, y: 0 }, size);
                ctx.moveTo(s.x, 0);
                ctx.lineTo(s.x, size.height);
            }
            for (let y = Math.floor(topLeft.y / step) * step; y <= bottomRight.y; y += step) {
                const s = this.camera.worldToScreen({ x: 0, y }, size);
                ctx.moveTo(0, s.y);
                ctx.lineTo(size.width, s.y);
            }
            ctx.stroke();
            const origin = this.camera.worldToScreen({ x: 0, y: 0 }, size);
            ctx.fillStyle = '#7fd1ff';
            ctx.fillRect(origin.x - 2, origin.y - 2, 4, 4);
        }
    }

    /**
     * Owns the <canvas> element: sizing, retina (DPR) handling, resize watching.
     */
    class Viewport {
        constructor(container) {
            this.cssSize = { width: 0, height: 0 };
            this.dpr = 1;
            /** Called by the engine after every resize */
            this.onResize = null;
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'block';
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            container.appendChild(this.canvas);
            const ctx = this.canvas.getContext('2d');
            if (!ctx) throw new Error('CanvasMapper: 2D context is not supported');
            this.context = ctx;
            this.observer = new ResizeObserver(() => this.resize());
            this.observer.observe(container);
            this.resize();
        }
        /** Physical pixels = CSS pixels * devicePixelRatio (retina support) */
        resize() {
            const rect = this.canvas.getBoundingClientRect();
            this.dpr = window.devicePixelRatio || 1;
            this.cssSize = { width: rect.width, height: rect.height };
            this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
            this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
            // From now on we draw in CSS pixels; the context scales to physical ones
            this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.onResize?.();
        }
        get size() {
            return this.cssSize;
        }
        get ctx() {
            return this.context;
        }
        clear() {
            this.context.clearRect(0, 0, this.cssSize.width, this.cssSize.height);
        }
        destroy() {
            this.observer.disconnect();
            this.canvas.remove();
        }
    }

    /**
     * Generic LRU cache built on Map insertion order.
     * get() refreshes recency; set() evicts the oldest when over capacity.
     */
    class TileCache {
        constructor(max) {
            this.max = max;
            this.entries = new Map();
        }
        get size() {
            return this.entries.size;
        }
        has(key) {
            return this.entries.has(key);
        }
        get(key) {
            const value = this.entries.get(key);
            if (value !== undefined) {
                // Re-insert so the entry becomes the most recent one
                this.entries.delete(key);
                this.entries.set(key, value);
            }
            return value;
        }
        set(key, value) {
            if (this.entries.has(key)) this.entries.delete(key);
            this.entries.set(key, value);
            while (this.entries.size > this.max) {
                const oldest = this.entries.keys().next();
                if (oldest.done) break;
                this.entries.delete(oldest.value);
            }
        }
        clear() {
            this.entries.clear();
        }
    }

    const coordKey = (coord) => `${coord.z}/${coord.x}_${coord.y}`;
    /**
     * Raw viewport∩pyramid range at sampling level tz.
     * Indices may be negative or >= n: slippy semantics (wrap X / skip Y)
     * are applied by the caller, so LOD math and the {z} placeholder
     * always agree on the same tz.
     */
    function computeVisibleRange(state, view, tileSize, tz) {
        const worldPerTile = tileSize / Math.pow(2, tz);
        const worldPerScreen = Math.pow(2, -state.zoom);
        const halfW = (view.width / 2) * worldPerScreen;
        const halfH = (view.height / 2) * worldPerScreen;
        return {
            minX: Math.floor((state.x - halfW) / worldPerTile),
            maxX: Math.floor((state.x + halfW) / worldPerTile),
            minY: Math.floor((state.y - halfH) / worldPerTile),
            maxY: Math.floor((state.y + halfH) / worldPerTile),
            n: Math.pow(2, tz),
        };
    }
    /**
     * Loads, caches and draws map tiles for the current view.
     * Works with a plain ViewState: the engine passes camera state, not a camera object.
     */
    class TileManager {
        constructor(source, tileSize, onRequestRedraw, cacheSize = 512) {
            this.source = source;
            this.tileSize = tileSize;
            this.onRequestRedraw = onRequestRedraw;
            this.inFlight = new Map();
            this.failed = new Set();
            this.cache = new TileCache(cacheSize);
            this.minNative = source.minNativeZoom ?? 0;
            this.maxNative = source.maxNativeZoom ?? 22;
        }
        /** Integer zoom level whose tiles we draw right now (LOD clamp) */
        tileZoomFor(zoom) {
            return clamp(Math.round(zoom), this.minNative, this.maxNative);
        }
        /** Kick off loads for visible tiles we don't have yet */
        update(state, view) {
            const tiles = this.visibleTiles(state, view);
            const z = this.tileZoomFor(state.zoom);
            const worldSize = this.tileSize / Math.pow(2, z);
            const scale = Math.pow(2, state.zoom);
            const cx = view.width / 2;
            const cy = view.height / 2;
            // Center-out ordering: tiles closer to the viewport center load first,
            // so the user always sees the important part of the map first under load.
            // Using squared screen distance — no sqrt needed for ordering.
            tiles.sort((a, b) => {
                const ax = (a.dx * worldSize - state.x) * scale + cx;
                const ay = (a.dy * worldSize - state.y) * scale + cy;
                const bx = (b.dx * worldSize - state.x) * scale + cx;
                const by = (b.dy * worldSize - state.y) * scale + cy;
                const da = (ax - cx) ** 2 + (ay - cy) ** 2;
                const db = (bx - cx) ** 2 + (by - cy) ** 2;
                return da - db;
            });
            for (const t of tiles) {
                const k = coordKey({ z: t.z, x: t.x, y: t.y });
                if (this.cache.get(k) || this.inFlight.has(k) || this.failed.has(k)) continue;
                const promise = this.source
                    .getTile({ z: t.z, x: t.x, y: t.y })
                    .then((image) => {
                        this.cache.set(k, image);
                        this.inFlight.delete(k);
                        this.onRequestRedraw();
                    })
                    .catch(() => {
                        this.failed.add(k);
                        this.inFlight.delete(k);
                        this.onRequestRedraw();
                    });
                this.inFlight.set(k, promise);
            }
        }
        /** Draw cached tiles intersecting the viewport, scaled for fractional zoom */
        draw(ctx, state, view) {
            const z = this.tileZoomFor(state.zoom);
            const worldSize = this.tileSize / Math.pow(2, z);
            const screenTile = this.tileSize * Math.pow(2, state.zoom - z);
            const scale = Math.pow(2, state.zoom);
            for (const t of this.visibleTiles(state, view)) {
                const image = this.cache.get(coordKey({ z: t.z, x: t.x, y: t.y }));
                if (!image) continue;
                // world→screen inline: (world - center) * scale + viewport center
                const px = (t.dx * worldSize - state.x) * scale + view.width / 2;
                const py = (t.dy * worldSize - state.y) * scale + view.height / 2;
                const w = screenTile * (image.width / this.tileSize);
                const h = screenTile * (image.height / this.tileSize);
                ctx.drawImage(image, px, py, w + 0.5, h + 0.5);
            }
        }
        /** Canonical (z, x, y) set for this frame; dx/dy = pre-wrap draw offsets */
        visibleTiles(state, view) {
            const z = this.tileZoomFor(state.zoom);
            const range = computeVisibleRange(state, view, this.tileSize, z);
            const grid = this.source.getGridSize?.(z) ?? {
                cols: Math.pow(2, z),
                rows: Math.pow(2, z),
            };
            const wrapX = this.source.wrapX ?? false;
            const tiles = [];
            for (let ix = range.minX; ix <= range.maxX; ix++) {
                for (let iy = range.minY; iy <= range.maxY; iy++) {
                    if (iy < 0 || iy >= grid.rows) continue; // Y outside world: skip
                    let x = ix;
                    if (wrapX)
                        x = ((ix % grid.cols) + grid.cols) % grid.cols; // X: wrap
                    else if (ix < 0 || ix >= grid.cols) continue; // bounded world: skip
                    tiles.push({ z, x, y: iy, dx: ix, dy: iy });
                }
            }
            return tiles;
        }
    }

    /** Load an <img> and resolve when it is ready to draw */
    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Image failed to load: ${url}`));
            image.src = url;
        });
    }
    /** Natural pixel size of any TileImage flavor */
    function tileImageSize(image) {
        if (image instanceof HTMLImageElement) {
            return { width: image.naturalWidth, height: image.naturalHeight };
        }
        return { width: image.width, height: image.height };
    }

    /** Serves tiles over HTTP using a URL template */
    class UrlTileSource {
        constructor(options) {
            this.template = options.urlTemplate;
            this.minNativeZoom = options.minNativeZoom;
            this.maxNativeZoom = options.maxNativeZoom;
            this.wrapX = options.wrapX ?? false;
        }
        getTileUrl(coord) {
            return this.template
                .replace('{z}', String(coord.z))
                .replace('{x}', String(coord.x))
                .replace('{y}', String(coord.y));
        }
        getGridSize(z) {
            const n = Math.pow(2, z);
            return { cols: n, rows: n };
        }
        getTile(coord) {
            const grid = this.getGridSize(coord.z);
            if (coord.x < 0 || coord.x >= grid.cols || coord.y < 0 || coord.y >= grid.rows) {
                return Promise.reject(
                    new Error(`tile ${coord.z}/${coord.x}_${coord.y} is outside the source grid`)
                );
            }
            return loadImage(this.getTileUrl(coord));
        }
    }

    /**
     * Default control styles. Every selector is wrapped in :where(), which has
     * ZERO specificity — so ANY user rule like `.cm-btn { ... }` wins regardless
     * of stylesheet order. Theming hooks: --cm-* CSS variables.
     */
    const DEFAULT_CONTROLS_CSS = `
:where(.cm-controls) {
    position: absolute; z-index: 10; display: flex;
    flex-direction: column; gap: 6px; margin: 12px;
    align-items: center;
}
:where(.cm-controls--topright) { top: 0; right: 0; }
:where(.cm-controls--topleft) { top: 0; left: 0; }
:where(.cm-controls--bottomright) { bottom: 0; right: 0; }
:where(.cm-controls--bottomleft) { bottom: 0; left: 0; }
:where(.cm-btn) {
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto;
    width: var(--cm-btn-size, 36px);
    height: var(--cm-btn-size, 36px);
    padding: 0;
    margin: 0;
    border-radius: var(--cm-btn-radius, 8px);
    background: var(--cm-btn-bg, rgba(15, 20, 32, 0.85));
    color: var(--cm-btn-color, #7fd1ff);
    border: 1px solid var(--cm-btn-border, rgba(127, 209, 255, 0.25));
    font: 600 18px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: transform 0.15s, background 0.15s;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
}
:where(.cm-btn svg) { display: block; }
:where(.cm-btn:hover) { background: var(--cm-btn-bg-hover, rgba(30, 41, 59, 0.9)); }
:where(.cm-btn:active) { transform: scale(0.95); }
:where(.cm-btn:focus-visible) { outline: 2px solid var(--cm-btn-color, #7fd1ff); outline-offset: 2px; }
@media (hover: none) and (pointer: coarse) {
    :where(.cm-btn) {
        width: var(--cm-btn-size-touch, 44px);
        height: var(--cm-btn-size-touch, 44px);
    }
}
`;
    /** Inject once per page (multiple maps share one style tag) */
    function injectDefaultStyles() {
        if (document.getElementById('cm-default-styles')) return;
        const style = document.createElement('style');
        style.id = 'cm-default-styles';
        style.textContent = DEFAULT_CONTROLS_CSS;
        document.head.appendChild(style);
    }

    /**
     * Stable class names (.cm-btn, .cm-controls--*) are part of the public API:
     * users style them from external CSS. Do not rename without a major version.
     */
    const BUTTONS = {
        in: { label: 'Zoom in', className: 'cm-btn--in', text: '+' },
        out: { label: 'Zoom out', className: 'cm-btn--out', text: '−' },
        reset: {
            label: 'Reset view',
            className: 'cm-btn--reset',
            // Inline SVG: unlike the U+2302 glyph, its optical center does not
            // depend on platform font metrics, so flex centering is exact
            svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.2 8 3l5.5 5.2"/><path d="M4.6 7.2v5.3h6.8V7.2"/></svg>',
        },
    };
    class Controls {
        constructor(engine, container, options = {}) {
            if (options.injectStyles !== false) injectDefaultStyles();
            // Absolute positioning needs a positioned container
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            this.root = document.createElement('div');
            this.root.className = `cm-controls cm-controls--${options.position ?? 'topright'}`;
            for (const name of options.buttons ?? ['in', 'out', 'reset']) {
                const meta = BUTTONS[name];
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `cm-btn ${meta.className}`;
                button.setAttribute('aria-label', meta.label);
                if (meta.svg) button.innerHTML = meta.svg;
                else button.textContent = meta.text ?? '';
                button.addEventListener('click', () => {
                    if (name === 'in') engine.zoomIn();
                    else if (name === 'out') engine.zoomOut();
                    else engine.resetView();
                });
                this.root.appendChild(button);
            }
            container.appendChild(this.root);
        }
        destroy() {
            this.root.remove();
        }
    }

    let nextMarkerId = 1;
    /**
     * A single map marker: plain data + a back-reference to its layer,
     * so mutations can request a redraw.
     */
    class Marker {
        constructor(options) {
            /** @internal set by the owning layer */
            this.layer = null;
            this.id = 'm' + nextMarkerId++;
            this.x = options.x;
            this.y = options.y;
            this.icon = options.icon;
            this.label = options.label;
            this.color = options.color ?? '#7fd1ff';
            this.size = options.size ?? 32;
            this.data = options.data;
        }
        setPosition(x, y) {
            this.x = x;
            this.y = y;
            this.layer?.requestRedraw();
        }
        /** Patch visual fields; the sprite cache re-keys automatically */
        update(patch) {
            if (patch.icon !== undefined) this.icon = patch.icon;
            if (patch.label !== undefined) this.label = patch.label;
            if (patch.color !== undefined) this.color = patch.color;
            if (patch.size !== undefined) this.size = patch.size;
            if (patch.data !== undefined) this.data = patch.data;
            this.layer?.requestRedraw();
        }
        remove() {
            this.layer?.removeMarker(this);
        }
    }

    /**
     * Composes and caches marker sprites (icon + label) on offscreen canvases.
     * Markers with the same visual signature share one sprite — composing a
     * sprite is the expensive part, and we do it once per unique look.
     */
    class SpriteCache {
        constructor() {
            this.sprites = new Map();
            this.icons = new Map();
            this.failedIcons = new Set();
            /** Called when an async sprite finishes composing -> layer redraws */
            this.onSpriteReady = null;
        }
        /** Visual signature: same look = same sprite */
        keyOf(marker) {
            return [marker.icon ?? '', marker.label ?? '', marker.color, marker.size].join('|');
        }
        loadIcon(url) {
            let promise = this.icons.get(url);
            if (!promise) {
                promise = loadImage(url);
                promise.catch(() => this.failedIcons.add(url));
                this.icons.set(url, promise);
            }
            return promise;
        }
        /**
         * Returns a ready sprite, or null while the icon is still loading
         * (the caller draws a cheap placeholder meanwhile).
         */
        getSprite(marker) {
            const key = this.keyOf(marker);
            const cached = this.sprites.get(key);
            if (cached) return cached;
            if (marker.icon && !this.failedIcons.has(marker.icon)) {
                this.loadIcon(marker.icon)
                    .then((image) => {
                        this.sprites.set(key, this.compose(image, marker));
                        this.onSpriteReady?.();
                    })
                    .catch(() => {
                        this.sprites.set(key, this.compose(null, marker));
                        this.onSpriteReady?.();
                    });
                return null;
            }
            const sprite = this.compose(null, marker);
            this.sprites.set(key, sprite);
            return sprite;
        }
        /** Draw icon (or dot) + label pill onto a fresh offscreen canvas */
        compose(icon, marker) {
            const size = marker.size;
            const labelHeight = marker.label ? 16 : 0;
            const pad = 4;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = '11px system-ui, sans-serif';
            const labelWidth = marker.label ? ctx.measureText(marker.label).width : 0;
            canvas.width = Math.ceil(Math.max(size, labelWidth + pad * 2));
            canvas.height = Math.ceil(size + labelHeight);
            const g = canvas.getContext('2d');
            if (icon) {
                g.drawImage(icon, (canvas.width - size) / 2, 0, size, size);
            } else {
                g.fillStyle = marker.color;
                g.beginPath();
                g.arc(canvas.width / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
                g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.8)';
                g.lineWidth = 1;
                g.stroke();
            }
            if (marker.label) {
                g.font = '11px system-ui, sans-serif';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                const pillWidth = g.measureText(marker.label).width + pad * 2;
                g.fillStyle = 'rgba(15, 20, 32, 0.75)';
                g.fillRect((canvas.width - pillWidth) / 2, size, pillWidth, labelHeight);
                g.fillStyle = '#ffffff';
                g.fillText(marker.label, canvas.width / 2, size + labelHeight / 2);
            }
            return canvas;
        }
    }

    /** World rect visible on screen, expanded by a margin (sprites hang out) */
    function computeVisibleBounds(camera, view, margin) {
        const topLeft = camera.screenToWorld({ x: 0, y: 0 }, view);
        const bottomRight = camera.screenToWorld({ x: view.width, y: view.height }, view);
        return {
            minX: topLeft.x - margin,
            minY: topLeft.y - margin,
            maxX: bottomRight.x + margin,
            maxY: bottomRight.y + margin,
        };
    }
    /**
     * An ordered collection of markers with culling, sprite caching and hit tests.
     */
    class MarkerLayer extends EventEmitter {
        constructor(name, options = {}) {
            super();
            /** @internal wired by LayerManager */
            this.onRequestRedraw = null;
            this.markers = [];
            this.byId = new Map();
            this.sprites = new SpriteCache();
            this.name = name;
            this.zIndex = options.zIndex ?? 0;
            this.visible = options.visible ?? true;
            this.sprites.onSpriteReady = () => this.requestRedraw();
        }
        get count() {
            return this.markers.length;
        }
        addMarker(options) {
            const marker = new Marker(options);
            marker.layer = this;
            this.markers.push(marker);
            this.byId.set(marker.id, marker);
            this.requestRedraw();
            return marker;
        }
        removeMarker(marker) {
            const index = this.markers.indexOf(marker);
            if (index === -1) return;
            this.markers.splice(index, 1);
            this.byId.delete(marker.id);
            marker.layer = null;
            this.requestRedraw();
        }
        getMarker(id) {
            return this.byId.get(id);
        }
        clear() {
            for (const marker of this.markers) marker.layer = null;
            this.markers.length = 0;
            this.byId.clear();
            this.requestRedraw();
        }
        show() {
            this.visible = true;
            this.requestRedraw();
        }
        hide() {
            this.visible = false;
            this.requestRedraw();
        }
        requestRedraw() {
            this.onRequestRedraw?.();
        }
        /** @internal draw only markers inside the visible bounds */
        draw(ctx, camera, view) {
            if (!this.visible || this.markers.length === 0) return;
            const bounds = computeVisibleBounds(camera, view, 64);
            for (const marker of this.markers) {
                // Viewport culling: skip everything outside the visible world rect
                if (marker.x < bounds.minX || marker.x > bounds.maxX) continue;
                if (marker.y < bounds.minY || marker.y > bounds.maxY) continue;
                const p = camera.worldToScreen(marker, view);
                const sprite = this.sprites.getSprite(marker);
                if (sprite) {
                    ctx.drawImage(sprite, p.x - sprite.width / 2, p.y - marker.size / 2);
                } else {
                    // Icon still loading: cheap placeholder dot
                    ctx.fillStyle = marker.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, marker.size / 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        /** @internal topmost marker under a screen point (size×size box) */
        hitTest(screen, camera, view) {
            if (!this.visible) return null;
            for (let i = this.markers.length - 1; i >= 0; i--) {
                const marker = this.markers[i];
                const p = camera.worldToScreen(marker, view);
                const half = marker.size / 2;
                if (
                    screen.x >= p.x - half &&
                    screen.x <= p.x + half &&
                    screen.y >= p.y - half &&
                    screen.y <= p.y + half
                ) {
                    return marker;
                }
            }
            return null;
        }
    }

    /**
     * Owns all layers, draws them in z-index order, hit-tests top-down.
     */
    class LayerManager {
        constructor() {
            this.layers = [];
            /** @internal wired by the engine */
            this.onRequestRedraw = null;
        }
        createLayer(name, options = {}) {
            const layer = new MarkerLayer(name, options);
            layer.onRequestRedraw = () => this.onRequestRedraw?.();
            this.layers.push(layer);
            this.layers.sort((a, b) => a.zIndex - b.zIndex);
            this.onRequestRedraw?.();
            return layer;
        }
        getLayer(name) {
            return this.layers.find((layer) => layer.name === name);
        }
        removeLayer(name) {
            const index = this.layers.findIndex((layer) => layer.name === name);
            if (index !== -1) this.layers.splice(index, 1);
            this.onRequestRedraw?.();
        }
        /** @internal */
        draw(ctx, camera, view) {
            for (const layer of this.layers) layer.draw(ctx, camera, view);
        }
        /** @internal topmost marker under the point across all layers */
        hitTest(screen, camera, view) {
            for (let i = this.layers.length - 1; i >= 0; i--) {
                const hit = this.layers[i].hitTest(screen, camera, view);
                if (hit) return hit;
            }
            return null;
        }
    }

    /** Web Mercator: lon/lat (degrees) → world units of the 256×256 z0 world */
    function lonLatToWorld(lon, lat) {
        const x = ((lon + 180) / 360) * 256;
        const s = Math.sin((lat * Math.PI) / 180);
        const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256;
        return { x, y };
    }
    /** Inverse projection: world units → lon/lat (degrees) */
    function worldToLonLat(p) {
        const lon = (p.x / 256) * 360 - 180;
        const n = Math.PI - 2 * Math.PI * (p.y / 256);
        const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        return { lon, lat };
    }

    const DEFAULTS = { strokeColor: '#7fd1ff', strokeWidth: 2 };
    function computeBbox(points, radius = 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of points) {
            minX = Math.min(minX, p.x - radius);
            minY = Math.min(minY, p.y - radius);
            maxX = Math.max(maxX, p.x + radius);
            maxY = Math.max(maxY, p.y + radius);
        }
        return { minX, minY, maxX, maxY };
    }
    function pointInPolygon(p, pts) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x;
            const yi = pts[i].y;
            const xj = pts[j].x;
            const yj = pts[j].y;
            if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi)
                inside = true;
        }
        return inside;
    }
    function distToSegment(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
    /**
     * Vector overlays: polylines, polygons, circles.
     * Shapes live in world units; styles are screen-constant (px widths).
     * Off-viewport shapes are culled by bbox before any path building.
     */
    class VectorLayer {
        constructor(name, options = {}) {
            this.visible = true;
            this.onRequestRedraw = null;
            this.shapes = [];
            this.nextId = 1;
            this.name = name;
            this.zIndex = options.zIndex ?? 0;
            this.defaults = options.defaults ?? {};
        }
        get count() {
            return this.shapes.length;
        }
        addPolyline(points, style = {}, data) {
            return this.push({ kind: 'polyline', points, style, data });
        }
        addPolygon(points, style = {}, data) {
            return this.push({ kind: 'polygon', points, style, data });
        }
        addCircle(center, radius, style = {}, data) {
            return this.push({ kind: 'circle', points: [center], radius, style, data });
        }
        /**
         * GeoJSON (lon/lat) → shapes. Supports LineString, MultiLineString,
         * Polygon (outer ring; holes ignored in v1), MultiPolygon.
         */
        addGeoJSON(geojson, style = {}, data) {
            const geometries =
                geojson.type === 'FeatureCollection'
                    ? (geojson.features ?? []).map((f) => f.geometry)
                    : geojson.type === 'Feature'
                      ? [geojson.geometry]
                      : [geojson];
            const toWorld = (ring) => ring.map(([lon, lat]) => lonLatToWorld(lon, lat));
            const added = [];
            for (const g of geometries) {
                if (!g) continue;
                if (g.type === 'LineString')
                    added.push(this.addPolyline(toWorld(g.coordinates), style, data));
                else if (g.type === 'MultiLineString')
                    for (const line of g.coordinates)
                        added.push(this.addPolyline(toWorld(line), style, data));
                else if (g.type === 'Polygon')
                    added.push(this.addPolygon(toWorld(g.coordinates[0]), style, data));
                else if (g.type === 'MultiPolygon')
                    for (const poly of g.coordinates)
                        added.push(this.addPolygon(toWorld(poly[0]), style, data));
            }
            return added;
        }
        remove(shape) {
            const i = this.shapes.indexOf(shape);
            if (i >= 0) this.shapes.splice(i, 1);
            this.onRequestRedraw?.();
        }
        clear() {
            this.shapes = [];
            this.onRequestRedraw?.();
        }
        draw(ctx, state, view) {
            if (!this.visible || this.shapes.length === 0) return;
            const scale = Math.pow(2, state.zoom);
            const halfW = view.width / 2 / scale;
            const halfH = view.height / 2 / scale;
            const minX = state.x - halfW;
            const maxX = state.x + halfW;
            const minY = state.y - halfH;
            const maxY = state.y + halfH;
            const toX = (wx) => (wx - state.x) * scale + view.width / 2;
            const toY = (wy) => (wy - state.y) * scale + view.height / 2;
            for (const s of this.shapes) {
                if (
                    s.bbox.maxX < minX ||
                    s.bbox.minX > maxX ||
                    s.bbox.maxY < minY ||
                    s.bbox.minY > maxY
                )
                    continue;
                const st = { ...DEFAULTS, ...this.defaults, ...s.style };
                ctx.save();
                ctx.lineWidth = st.strokeWidth ?? 2;
                ctx.strokeStyle = st.strokeColor ?? '#7fd1ff';
                if (st.dash) ctx.setLineDash(st.dash);
                ctx.beginPath();
                if (s.kind === 'circle') {
                    ctx.arc(
                        toX(s.points[0].x),
                        toY(s.points[0].y),
                        (s.radius ?? 0) * scale,
                        0,
                        Math.PI * 2
                    );
                } else {
                    ctx.moveTo(toX(s.points[0].x), toY(s.points[0].y));
                    for (let i = 1; i < s.points.length; i++)
                        ctx.lineTo(toX(s.points[i].x), toY(s.points[i].y));
                    if (s.kind === 'polygon') ctx.closePath();
                }
                if (st.fillColor && s.kind !== 'polyline') {
                    ctx.globalAlpha = st.fillOpacity ?? 0.25;
                    ctx.fillStyle = st.fillColor;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                ctx.restore();
            }
        }
        /** Topmost shape under a world point; tolerance in screen px */
        hitTest(world, tolerancePx, zoom) {
            const scale = Math.pow(2, zoom);
            const tol = tolerancePx / scale;
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                const s = this.shapes[i];
                if (s.kind === 'polygon') {
                    if (pointInPolygon(world, s.points)) return s;
                    continue;
                }
                if (s.kind === 'circle') {
                    const d = Math.hypot(world.x - s.points[0].x, world.y - s.points[0].y);
                    if (d <= (s.radius ?? 0) + tol) return s;
                    continue;
                }
                const half =
                    (s.style.strokeWidth ?? this.defaults.strokeWidth ?? 2) / 2 / scale + tol;
                for (let j = 1; j < s.points.length; j++) {
                    if (distToSegment(world, s.points[j - 1], s.points[j]) <= half) return s;
                }
            }
            return null;
        }
        push(part) {
            const shape = {
                ...part,
                id: this.nextId++,
                bbox: computeBbox(part.points, part.radius ?? 0),
            };
            this.shapes.push(shape);
            this.onRequestRedraw?.();
            return shape;
        }
    }

    /**
     * Main entry point of CanvasMapper.
     * Orchestrates viewport, camera, input and the render loop.
     */
    class MapEngine extends EventEmitter {
        constructor(container, options = {}) {
            super();
            this.layers = new LayerManager();
            /** Vector layers shared with the renderer by reference — additions sort in place. */
            this.vectors = [];
            this.homeView = { x: 0, y: 0, zoom: 0 };
            this.dirty = true;
            this.raf = 0;
            this.lastTime = 0;
            this.inertia = null;
            /** The heartbeat: rAF loop with dirty flag, smooth zoom and inertia */
            this.frame = (now) => {
                this.raf = requestAnimationFrame(this.frame);
                const dt = this.lastTime ? Math.min(50, now - this.lastTime) : 16;
                this.lastTime = now;
                let active = this.dirty;
                // 1) ease current zoom towards the target (fractional smooth zoom)
                const zoom = this.camera.getViewState().zoom;
                const diff = this.targetZoom - zoom;
                if (Math.abs(diff) > 0.0005) {
                    // Frame-rate independent exponential smoothing
                    const t = 1 - Math.pow(0.001, dt / 1000);
                    this.camera.zoomAt(this.zoomAnchor, this.viewport.size, zoom + diff * t);
                    active = true;
                }
                // 2) inertia after a drag release
                if (this.inertia) {
                    this.camera.panByScreen(this.inertia.x * dt, this.inertia.y * dt);
                    const decay = Math.pow(0.5, dt / 120); // speed halves every 120ms
                    this.inertia.x *= decay;
                    this.inertia.y *= decay;
                    if (Math.hypot(this.inertia.x, this.inertia.y) < 0.02) this.inertia = null;
                    active = true;
                }
                if (active) {
                    this.renderer.render();
                    this.dirty = false;
                    this.emit('viewchange', this.getView());
                }
            };
            this.options = {
                tileSize: options.tileSize ?? 256,
                urlTemplate: options.urlTemplate ?? '/tiles/{z}/{x}_{y}.png',
                minZoom: options.minZoom ?? 0,
                maxZoom: options.maxZoom ?? 18,
                smoothZoom: options.zoom?.smooth ?? true,
                zoomStep: options.zoom?.step ?? 1,
            };
            this.viewport = new Viewport(container);
            this.camera = new Camera({
                minZoom: this.options.minZoom,
                maxZoom: this.options.maxZoom,
            });
            const source =
                options.source ?? new UrlTileSource({ urlTemplate: this.options.urlTemplate });
            this.tiles = new TileManager(source, this.options.tileSize, () => {
                this.dirty = true;
            });
            this.layers.onRequestRedraw = () => {
                this.dirty = true;
            };
            // Pass the SAME vectors array to the renderer — later additions are seen automatically.
            this.renderer = new Renderer(
                this.viewport,
                this.camera,
                this.tiles,
                this.layers,
                this.vectors
            );
            this.targetZoom = this.camera.getViewState().zoom;
            this.zoomAnchor = this.center();
            this.input = new InputController(this.viewport.canvas, {
                onPanStart: () => {
                    this.inertia = null;
                },
                onPan: (dx, dy) => {
                    this.camera.panByScreen(dx, dy);
                    this.dirty = true;
                },
                onPanEnd: (velocity) => {
                    if (Math.hypot(velocity.x, velocity.y) > 0.05) this.inertia = velocity;
                },
                onZoom: (delta, anchor) => this.applyZoom(delta, anchor),
                onTap: (screen) => {
                    // screen is already in canvas-local coords (TouchStrategy.toLocal / mouse click offset)
                    const world = this.screenToWorld(screen);
                    const marker = this.layers.hitTest(screen, this.camera, this.viewport.size);
                    if (marker) {
                        this.emit('marker:click', { marker, screen, world });
                        marker.layer?.emit('click', marker);
                    } else {
                        // Vector hit-test (top layer first)
                        const z = this.camera.getViewState().zoom;
                        for (let i = this.vectors.length - 1; i >= 0; i--) {
                            const v = this.vectors[i];
                            if (!v.visible) continue;
                            const shape = v.hitTest(world, 4, z);
                            if (shape) {
                                this.emit('vector:click', { layer: v, shape, screen, world });
                                break;
                            }
                        }
                    }
                    this.emit('click', { screen, world, marker });
                },
            });
            const controlsRaw = options.controls ?? true;
            const controlsOptions =
                typeof controlsRaw === 'boolean' ? { enabled: controlsRaw } : controlsRaw;
            this.controls =
                controlsOptions.enabled === false
                    ? null
                    : new Controls(this, container, controlsOptions);
            this.viewport.onResize = () => {
                this.dirty = true;
            };
            this.raf = requestAnimationFrame(this.frame);
        }
        /** Current view: world-space center + fractional zoom */
        getView() {
            return this.camera.getViewState();
        }
        setView(state) {
            this.camera.setViewState(state);
            if (state.zoom !== undefined) this.targetZoom = this.camera.getViewState().zoom;
            this.zoomAnchor = this.center();
            this.dirty = true;
            this.homeView = this.camera.getViewState();
        }
        zoomIn() {
            this.applyZoom(this.options.zoomStep, this.center());
        }
        zoomOut() {
            this.applyZoom(-this.options.zoomStep, this.center());
        }
        /** Return to the last explicitly set view */
        resetView() {
            this.setView({ ...this.homeView });
        }
        getOptions() {
            return this.options;
        }
        worldToScreen(point) {
            return this.camera.worldToScreen(point, this.viewport.size);
        }
        screenToWorld(point) {
            return this.camera.screenToWorld(point, this.viewport.size);
        }
        destroy() {
            cancelAnimationFrame(this.raf);
            this.input.destroy();
            this.viewport.destroy();
            this.controls?.destroy();
        }
        /** Create a marker layer (drawn in z-index order) */
        createLayer(name, options = {}) {
            return this.layers.createLayer(name, options);
        }
        /** Create a vector layer for polylines, polygons and circles */
        createVectorLayer(name, options = {}) {
            const layer = new VectorLayer(name, options);
            layer.onRequestRedraw = () => {
                this.dirty = true;
            };
            this.vectors.push(layer);
            this.vectors.sort((a, b) => a.zIndex - b.zIndex);
            this.dirty = true;
            return layer;
        }
        center() {
            const size = this.viewport.size;
            return { x: size.width / 2, y: size.height / 2 };
        }
        applyZoom(delta, anchor) {
            this.zoomAnchor = anchor;
            const next = clamp(this.targetZoom + delta, this.options.minZoom, this.options.maxZoom);
            this.targetZoom = next;
            if (!this.options.smoothZoom) {
                this.camera.zoomAt(anchor, this.viewport.size, next);
                this.dirty = true;
            }
            // smooth mode: the render loop eases towards targetZoom itself
        }
    }

    /** One-shot rAF animation. Returns a cancel function. */
    function animate(options) {
        const easing = options.easing ?? Easings.easeOutCubic;
        const start = performance.now();
        let frame = 0;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / options.duration);
            options.onUpdate(easing(t));
            if (t < 1) frame = requestAnimationFrame(tick);
            else options.onComplete?.();
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }

    /**
     * A flat matrix of same-size images: 1-1.png .. N-N.png.
     * The matrix is a single native zoom level; other zooms are scaled
     * automatically by TileManager (LOD clamp).
     */
    class MatrixTileSource {
        constructor(options) {
            this.expected = null;
            if (!options.urlTemplate && !options.resolveUrl) {
                throw new Error('MatrixTileSource requires urlTemplate or resolveUrl');
            }
            this.template = options.urlTemplate ?? null;
            this.resolveUrl = options.resolveUrl ?? null;
            this.cols = options.cols;
            this.rows = options.rows;
            this.firstIndex = options.firstIndex ?? 1;
            this.warnOnMismatch = options.warnOnMismatch ?? true;
            const nz = options.nativeZoom ?? 0;
            this.minNativeZoom = nz;
            this.maxNativeZoom = nz;
        }
        /** File url for internal 0-based tile indices */
        getUrl(x, y) {
            if (this.resolveUrl) return this.resolveUrl(x, y);
            return this.template
                .replace('{x}', String(x + this.firstIndex))
                .replace('{y}', String(y + this.firstIndex));
        }
        hasTile(coord) {
            if (coord.z !== this.minNativeZoom) return false;
            if (this.cols === undefined || this.rows === undefined) return true;
            return coord.x >= 0 && coord.y >= 0 && coord.x < this.cols && coord.y < this.rows;
        }
        getGridSize(_z) {
            // Matrix lives at one zoom level. Grid size is constant;
            // when cols/rows are unknown we return MAX_SAFE_INTEGER so
            // TileManager's clamp never hides tiles prematurely.
            const cols = this.cols ?? Number.MAX_SAFE_INTEGER;
            const rows = this.rows ?? Number.MAX_SAFE_INTEGER;
            return { cols, rows };
        }
        async getTile(coord) {
            const grid = this.getGridSize(coord.z);
            if (coord.x < 0 || coord.x >= grid.cols || coord.y < 0 || coord.y >= grid.rows) {
                return Promise.reject(
                    new Error(`tile ${coord.z}/${coord.x}_${coord.y} is outside the matrix`)
                );
            }
            const image = await loadImage(this.getUrl(coord.x, coord.y));
            this.noteTileSize(coord, tileImageSize(image));
            return image;
        }
        /**
         * Size bookkeeping: first size becomes "expected", the largest one is
         * the "best". Mismatches produce a warning; rendering stretches every
         * tile to its grid cell anyway (smaller sources just look blurrier).
         */
        noteTileSize(coord, size) {
            if (!this.expected) this.expected = size;
            if (
                this.warnOnMismatch &&
                (size.width !== this.expected.width || size.height !== this.expected.height)
            ) {
                console.warn(
                    `CanvasMapper: tile ${coord.x}_${coord.y} is ${size.width}x${size.height}, ` +
                        `expected ${this.expected.width}x${this.expected.height}. ` +
                        'Mixed sizes will be stretched and may look blurry. ' +
                        'Pass warnOnMismatch: false to silence this.'
                );
            }
        }
    }

    /**
     * Fetch a remote image as a Blob. Needed because createImageBitmap
     * works only with Blob/File/ImageBitmap sources, not with HTMLImageElement.
     */
    async function fetchAsBlob(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        return response.blob();
    }

    /**
     * Minimal IndexedDB wrapper for caching tile blobs.
     * Key: string (tile address), value: Blob (decoded image).
     * Survives page reloads — user reopens the page, tiles are already there.
     */
    class IDBTileCache {
        constructor(namespace) {
            this.storeName = 'tiles';
            this.dbPromise = null;
            this.dbName = `canvasmapper_${namespace}`;
        }
        open() {
            if (this.dbPromise) return this.dbPromise;
            this.dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore(this.storeName);
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            return this.dbPromise;
        }
        /** Get a cached blob, or undefined if not present */
        async get(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const request = tx.objectStore(this.storeName).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        /** Store a blob under a key */
        async set(key, value) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(value, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
        /** Check whether a key exists without loading the value */
        async has(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                // count with a key range is the fastest existence check
                const range = IDBKeyRange.only(key);
                const request = tx.objectStore(this.storeName).count(range);
                request.onsuccess = () => resolve(request.result > 0);
                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * Serves tiles sliced on-the-fly from a single large image.
     *
     * How it works:
     *  - The whole image is loaded ONCE as a Blob (via fetch or directly passed).
     *  - Each tile request decodes only its region via createImageBitmap.
     *  - Decoded tiles are cached in IndexedDB, so second visits are instant.
     *
     * Memory cost: only the Blob bytes + currently-decoded tiles.
     * A 10 000 x 10 000 JPEG typically weighs ~5–15 MB, easily fits anywhere.
     */
    class SingleImageSource {
        constructor(options) {
            // One native level: the source image is a flat matrix at zoom 0.
            // Other zooms are handled by TileManager's LOD clamp.
            this.minNativeZoom = 0;
            this.maxNativeZoom = 0;
            this.imageDimensions = null;
            this.cols = 0;
            this.rows = 0;
            this.tileSize = options.tileSize ?? 256;
            this.cache = options.disableCache
                ? null
                : new IDBTileCache(options.cacheKey ?? `img_${this.tileSize}`);
            // Resolve the blob once, regardless of input shape.
            this.blobPromise =
                typeof options.source === 'string'
                    ? fetchAsBlob(options.source)
                    : Promise.resolve(options.source);
            // Eagerly measure the image so hasTile can filter out-of-range requests.
            // Swallow failures: dimensions simply stay unknown (hasTile stays
            // optimistic), and a real error will surface later via getTile's reject,
            // which TileManager already handles with its negative cache.
            this.measureImage().catch(() => {});
        }
        /**
         * Decode the blob as an ImageBitmap once to read natural dimensions,
         * then throw it away — we only need width/height for bounds checking.
         */
        async measureImage() {
            const blob = await this.blobPromise;
            const probe = await createImageBitmap(blob);
            this.imageDimensions = { width: probe.width, height: probe.height };
            this.cols = Math.ceil(probe.width / this.tileSize);
            this.rows = Math.ceil(probe.height / this.tileSize);
            probe.close();
        }
        hasTile(coord) {
            if (coord.z !== 0) return false;
            // Dimensions may not be known yet (async measureImage); until then
            // we optimistically allow the request and let the tile fail later.
            if (!this.imageDimensions) return true;
            return coord.x >= 0 && coord.y >= 0 && coord.x < this.cols && coord.y < this.rows;
        }
        getGridSize(_z) {
            // Before measureImage resolves: no clamp — let the request attempt
            // and fail into the negative cache. After: exact grid dimensions.
            if (!this.imageDimensions) {
                return { cols: Number.MAX_SAFE_INTEGER, rows: Number.MAX_SAFE_INTEGER };
            }
            return { cols: this.cols, rows: this.rows };
        }
        async getTile(coord) {
            const grid = this.getGridSize(coord.z);
            if (coord.x < 0 || coord.x >= grid.cols || coord.y < 0 || coord.y >= grid.rows) {
                return Promise.reject(
                    new Error(`tile ${coord.z}/${coord.x}_${coord.y} is outside the image`)
                );
            }
            // 1. Try IndexedDB cache first
            const cacheKey = `${coord.z}/${coord.x}_${coord.y}`;
            if (this.cache) {
                const cached = await this.cache.get(cacheKey);
                if (cached) return createImageBitmap(cached);
            }
            // 2. Decode only the requested region from the source blob.
            //    sx/sy/sw/sh tell createImageBitmap to decode just that rect.
            const blob = await this.blobPromise;
            const sx = coord.x * this.tileSize;
            const sy = coord.y * this.tileSize;
            const dims = this.imageDimensions;
            const sw = dims ? Math.min(this.tileSize, dims.width - sx) : this.tileSize;
            const sh = dims ? Math.min(this.tileSize, dims.height - sy) : this.tileSize;
            const tile = await createImageBitmap(blob, sx, sy, sw, sh);
            // 3. Warm the cache asynchronously — don't slow down the tile draw.
            if (this.cache && dims) {
                this.persistToCache(cacheKey, tile).catch(() => {
                    /* cache write is best-effort */
                });
            }
            return tile;
        }
        /**
         * Re-encode the tile bitmap into a PNG blob and write to IndexedDB.
         * Uses OffscreenCanvas.convertToBlob when available (off-main-thread-ready),
         * falls back to a regular canvas otherwise.
         */
        async persistToCache(key, bitmap) {
            if (!this.cache) return;
            let pngBlob;
            if (typeof OffscreenCanvas !== 'undefined') {
                // Branch 1: canvas is OffscreenCanvas, ctx is OffscreenCanvasRenderingContext2D
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(bitmap, 0, 0);
                pngBlob = await canvas.convertToBlob({ type: 'image/png' });
            } else {
                // Branch 2: canvas is HTMLCanvasElement, ctx is CanvasRenderingContext2D
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(bitmap, 0, 0);
                pngBlob = await new Promise((resolve) =>
                    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/png')
                );
            }
            await this.cache.set(key, pngBlob);
        }
    }

    /**
     * CanvasMapper — high-performance Canvas map engine
     * @packageDocumentation
     */
    // Core
    // Version
    const VERSION = '1.1.0';

    exports.Camera = Camera;
    exports.Controls = Controls;
    exports.EventEmitter = EventEmitter;
    exports.IDBTileCache = IDBTileCache;
    exports.InputController = InputController;
    exports.LayerManager = LayerManager;
    exports.MapEngine = MapEngine;
    exports.Marker = Marker;
    exports.MarkerLayer = MarkerLayer;
    exports.MatrixTileSource = MatrixTileSource;
    exports.SingleImageSource = SingleImageSource;
    exports.SpriteCache = SpriteCache;
    exports.TileCache = TileCache;
    exports.TileManager = TileManager;
    exports.UrlTileSource = UrlTileSource;
    exports.VERSION = VERSION;
    exports.VectorLayer = VectorLayer;
    exports.animate = animate;
    exports.computeVisibleBounds = computeVisibleBounds;
    exports.computeVisibleRange = computeVisibleRange;
    exports.lonLatToWorld = lonLatToWorld;
    exports.worldToLonLat = worldToLonLat;
});
//# sourceMappingURL=canvasmapper.umd.js.map
