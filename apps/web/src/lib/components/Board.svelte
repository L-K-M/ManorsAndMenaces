<script lang="ts">
  // The SVG board (spec §47). Layers, bottom to top: sea, terrain/Regions,
  // Routes, Sites/Holdings, Banners, Menaces, highlights. Every interactive
  // entity is a focusable button with an accessible name (spec §52).
  import { getPlayerBanners, type Banner, type HarvestPreview, type LegalActionSummary, type MenaceInstance } from "@manors-menaces/rules";
  import { onMount, untrack } from "svelte";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { onPick, type Highlights } from "../game/interaction.js";
  import { BoardAlign, LABEL, bannerSlot, boardToScreen, labelLod, nameLineLength, noteSlots, placeNote, screenScale, strokeWidth, wrapLabel, type Circle, type Rect, type Segment } from "../game/board-view.js";
  import { describePick } from "../game/inspect.js";
  import { regionName } from "../game/log.js";
  import { ui, type Pick } from "../stores/ui.svelte.js";
  import { addedTargets, boundsOf, isDoubleTap, isDrag, pathPoints, wheelIntent, type Point, type Tap } from "../stores/camera.js";
  import { viewport, frameIfHidden, panScreen, pinch, resetView, setContainer, setWorld, zoomAtScreen } from "../stores/viewport.svelte.js";
  import { settings, animationScale } from "../stores/settings.svelte.js";
  import { PLAYER_THEMES, RESOURCE_COLORS, RESOURCE_GLYPHS, emblemPath } from "../theme.js";
  import { bridgeRails } from "../art/routes.js";
  import CoastLayer from "./board/CoastLayer.svelte";
  import HoldingFigure from "./board/HoldingFigure.svelte";
  import LandmarkArt from "./board/LandmarkArt.svelte";
  import MenaceFigure from "./board/MenaceFigure.svelte";
  import TerrainLayer from "./board/TerrainLayer.svelte";

  // `legal`, `hl` and `preview` are derived once in GameScreen and shared.
  let {
    session,
    legal,
    hl,
    preview,
  }: { session: GameSession; legal: LegalActionSummary | null; hl: Highlights; preview: HarvestPreview | null } = $props();

  const map = $derived(session.map);
  const gs = $derived(session.draft);
  const sitesById = $derived(new Map(map.sites.map((s) => [s.id, s])));
  const regionsById = $derived(new Map(map.regions.map((r) => [r.id, r])));
  const routesById = $derived(new Map(map.routes.map((r) => [r.id, r])));

  // The camera keeps the island (its coastline and extent) in view.
  const coast = $derived(pathPoints(map.coastline));
  const island = $derived(boundsOf(coast) ?? { x: 0, y: 0, w: map.width, h: map.height });
  $effect(() => setWorld(island, coast));
  // Every game opens on the whole island, not wherever the last one left off.
  onMount(() => resetView("instant"));

  function playerTheme(playerId: string | null | undefined) {
    const seat = session.seat(playerId);
    return PLAYER_THEMES[seat?.color ?? 0] ?? PLAYER_THEMES[0]!;
  }

  // Banner positions: assigned Banners sit in slots around the Region label;
  // unassigned ones cluster at their Holding. During assignment the local
  // draft overrides the actor's Banners.
  const bannerRegion = (b: Banner): string | null => (b.id in ui.bannerDraft ? (ui.bannerDraft[b.id] ?? null) : b.regionId);
  const bannerPositions = $derived.by(() => {
    const out = new Map<string, { x: number; y: number }>();
    const byRegion = new Map<string, Banner[]>();
    const byHolding = new Map<string, Banner[]>();
    for (const b of Object.values(gs.banners)) {
      const r = bannerRegion(b);
      if (r) byRegion.set(r, [...(byRegion.get(r) ?? []), b]);
      else byHolding.set(b.holdingId, [...(byHolding.get(b.holdingId) ?? []), b]);
    }
    for (const [regionId, list] of byRegion) {
      const region = regionsById.get(regionId);
      if (!region) continue;
      list.sort((a, b) => a.id.localeCompare(b.id));
      list.forEach((b, i) => out.set(b.id, bannerSlot({ x: region.labelX, y: region.labelY }, i, list.length)));
    }
    for (const [holdingId, list] of byHolding) {
      const h = gs.holdings[holdingId];
      const site = h ? sitesById.get(h.siteId) : undefined;
      if (!site) continue;
      list.forEach((b, i) => out.set(b.id, { x: site.x + 16 + i * 12, y: site.y - 20 }));
    }
    return out;
  });

  const previewByRegion = $derived(new Map((preview?.banners ?? []).map((b) => [b.regionId, b])));

  // Pre-indexed lookups so the Site and Region loops stay O(1) per entity
  // instead of scanning all holdings/banners for every Site/Region.
  const holdingBySite = $derived(new Map(Object.values(gs.holdings).map((h) => [h.siteId, h])));
  const bannerCountByRegion = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const b of Object.values(gs.banners)) {
      const r = bannerRegion(b);
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return counts;
  });

  function menacePos(m: MenaceInstance): { x: number; y: number } {
    const loc = m.location;
    if (loc.kind === "region") {
      const r = regionsById.get(loc.regionId);
      return r ? { x: r.labelX + 40, y: r.labelY + 4 } : { x: 0, y: 0 };
    }
    if (loc.kind === "site") {
      const s = sitesById.get(loc.siteId);
      return s ? { x: s.x - 22, y: s.y + 20 } : { x: 0, y: 0 };
    }
    const route = routesById.get(loc.routeId);
    const a = route && sitesById.get(route.siteA);
    const b = route && sitesById.get(route.siteB);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  }

  const fogged = $derived(new Set(gs.activeEffects.filter((e) => e.kind === "fog").map((e) => (e.kind === "fog" ? e.routeId : ""))));

  // ------------------------------------------------------------------ input
  let svgEl: SVGSVGElement | undefined = $state();
  let boardW = $state(1);
  let boardH = $state(1);
  $effect(() => setContainer(boardW, boardH));
  // The SVG has no viewBox, so its user units are CSS px; this maps the
  // camera's box (board units, same aspect as the board) onto them.
  const cameraTransform = $derived.by(() => {
    const { x, y, w } = viewport.box;
    const k = boardW / w;
    return `matrix(${k} 0 0 ${k} ${-x * k} ${-y * k})`;
  });

  // Active pointers in container px: where each went down and where it was
  // last seen. A press only becomes a drag once it has moved past a small
  // threshold from where it went down; until then it may still be a pick.
  const pointers = new Map<number, { down: Point; last: Point }>();
  /** The current gesture moved the camera, so it must not also pick. */
  let dragMoved = false;
  let lastTap: Tap | null = null;
  // The board's top-left in client px, measured once per gesture. Input
  // events arrive before the frame's camera write, so this read does not
  // force a layout.
  let origin: Point = { x: 0, y: 0 };

  function measure() {
    const r = svgEl?.getBoundingClientRect();
    if (r) origin = { x: r.left, y: r.top };
  }
  function local(e: MouseEvent): Point {
    return { x: e.clientX - origin.x, y: e.clientY - origin.y };
  }
  function capture(id: number) {
    try {
      svgEl?.setPointerCapture(id);
    } catch {
      // The pointer is already gone (released between events); nothing to capture.
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const intent = wheelIntent(e);
    if (intent.kind === "pan") return panScreen(intent.dx, intent.dy);
    measure();
    zoomAtScreen(intent.factor, local(e));
  }
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointers.size === 0) dragMoved = false;
    measure();
    const p = local(e);
    pointers.set(e.pointerId, { down: p, last: p });
    if (pointers.size < 2) return;
    // A second finger turns the press into a pinch: never a pick. Capture
    // both so the gesture keeps working when fingers leave the board.
    dragMoved = true;
    for (const id of pointers.keys()) capture(id);
  }
  function onPointerMove(e: PointerEvent) {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    // A mouse or pen released outside the window never sent pointerup here.
    if (e.pointerType !== "touch" && e.buttons === 0) return release(e.pointerId);
    const cur = local(e);
    const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      pinch([tracked.last, other.last], [cur, other.last]);
      tracked.last = cur;
      return;
    }
    if (!dragMoved) {
      if (!isDrag(tracked.down, cur, e.pointerType)) return;
      // Capture only now, so a plain click still reaches the piece under it.
      dragMoved = true;
      capture(e.pointerId);
    }
    // On the first drag move `last` is still the press point, so the view
    // catches up with the whole distance moved so far.
    panScreen(cur.x - tracked.last.x, cur.y - tracked.last.y);
    tracked.last = cur;
  }
  function release(id: number) {
    pointers.delete(id);
  }
  // Listened for on the window: a press that crept off the board before it
  // became a drag was never captured, so its pointerup lands elsewhere.
  function onPointerUp(e: PointerEvent) {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    release(e.pointerId);
    if (e.type !== "pointerup" || dragMoved || pointers.size > 0) return;
    // A tap on a highlighted target is a pick; it never starts a double tap.
    if ((e.target as Element | null)?.closest?.(".hl")) {
      lastTap = null;
      return;
    }
    const tap = { at: e.timeStamp, x: tracked.last.x, y: tracked.last.y };
    if (!isDoubleTap(lastTap, tap)) {
      lastTap = tap;
      return;
    }
    lastTap = null;
    zoomAtScreen(2, tracked.last, "animate");
  }

  function pick(p: Pick) {
    if (dragMoved) return;
    // The inspector (or the move itself) takes over from the hover card.
    clearHover();
    void onPick(session, legal, p);
  }

  // When new targets appear (a tool, a card step, the next setup placement)
  // and most of them are off-screen, glide to show them (spec §48). Targets
  // are keyed `kind:id`.
  function targetKeys(): string[] {
    const keyed = (kind: string, ids: Iterable<string>) => [...ids].map((id) => `${kind}:${id}`);
    return [
      ...keyed("site", hl.sites),
      ...keyed("route", hl.routes),
      ...keyed("region", hl.regions),
      ...keyed("banner", hl.banners),
      ...keyed("menace", hl.menaces),
      ...keyed("location", hl.locations),
    ];
  }
  function targetPoints(keys: readonly string[]): Point[] {
    const pts: Point[] = [];
    const site = (id: string) => sitesById.get(id);
    const routeMid = (id: string) => {
      const r = routesById.get(id);
      const a = r && site(r.siteA);
      const b = r && site(r.siteB);
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined;
    };
    const region = (id: string) => {
      const r = regionsById.get(id);
      return r && { x: r.labelX, y: r.labelY };
    };
    const point = (kind: string, id: string): Point | undefined => {
      if (kind === "site") return site(id);
      if (kind === "route") return routeMid(id);
      if (kind === "region") return region(id);
      if (kind === "banner") return bannerPositions.get(id);
      if (kind === "menace") {
        const m = gs.menaces[id];
        return m && menacePos(m);
      }
      if (kind === "location") {
        const [where = "", whereId = ""] = id.split(":");
        return point(where, whereId);
      }
      return undefined;
    };
    for (const k of keys) {
      const cut = k.indexOf(":");
      const p = point(k.slice(0, cut), k.slice(cut + 1));
      if (p) pts.push(p);
    }
    return pts;
  }
  let framed = new Set<string>();
  $effect(() => {
    const keys = targetKeys();
    const added = addedTargets(framed, keys);
    framed = new Set(keys);
    if (added.length) untrack(() => frameIfHidden(targetPoints(added)));
  });
  function key(e: KeyboardEvent, p: Pick) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      clearHover();
      void onPick(session, legal, p);
    }
  }

  // While targets are highlighted, everything else stops catching clicks so a
  // short Route is not hidden behind the hit areas of its end Sites.
  const targeting = $derived(hl.sites.size + hl.routes.size + hl.regions.size + hl.banners.size + hl.menaces.size + hl.locations.size > 0);
  const dur = $derived(animationScale());
  const bannerLabel = (b: Banner) => {
    const owner = gs.players[b.ownerId]?.displayName ?? "";
    const r = bannerRegion(b);
    const place = r ? t("aria.banner_in", { owner, region: regionName(map, r) }) : t("aria.banner_home", { owner });
    return b.settled ? `${place}${t("aria.banner_settled")}` : place;
  };
  const myBanners = $derived(new Set(session.localActor ? getPlayerBanners(gs, session.localActor).map((b) => b.id) : []));

  // ------------------------------------------------------------------ view scale
  // Labels, outlines and rings are sized from the camera scale so they stay
  // legible and crisp at any zoom (see board-view.ts).
  // The camera fills the container at its own aspect (no letterboxing).
  const align = BoardAlign.Middle;
  const k = $derived(screenScale({ w: boardW, h: boardH }, viewport.box));
  const lod = $derived(labelLod(k, settings.textScale));
  /** Width of `screenPx` CSS px in board units, never below `min`. */
  const px = (screenPx: number, min = 0) => strokeWidth(screenPx, k, min);
  const siteRing = (hasHolding: boolean) => (hasHolding ? px(13, 24) : px(9, 15));
  const bannerRing = $derived(px(11, 17));
  const menaceRing = $derived(px(12, 24));
  const postScale = $derived(Math.min(2.2, Math.max(1, 1 / k)));

  // ------------------------------------------------------------------ targets
  // Targets stay bright under crisp outlines while a veil dims the rest of the
  // island; only the glow overlay breathes (a separate <svg> whose opacity the
  // compositor animates, so the board itself is not repainted every frame).
  const hlRegions = $derived(map.regions.filter((r) => hl.regions.has(r.id) || hl.locations.has(`region:${r.id}`)));
  const veilPath = $derived([map.coastline, ...hlRegions.map((r) => r.path)].join(" "));
  const hlRouteLines = $derived(
    map.routes
      .filter((r) => hl.routes.has(r.id) || hl.locations.has(`route:${r.id}`))
      .map((r) => ({ id: r.id, a: sitesById.get(r.siteA), b: sitesById.get(r.siteB) })),
  );
  const hlSites = $derived(map.sites.filter((s) => hl.sites.has(s.id) || hl.locations.has(`site:${s.id}`)));
  const ringedBanners = $derived(Object.values(gs.banners).filter((b) => hl.banners.has(b.id) || ui.selectedBannerId === b.id));
  const ringedMenaces = $derived(Object.values(gs.menaces).filter((m) => hl.menaces.has(m.id) || ui.selectedMenaceId === m.id));
  const destRegions = $derived(hlRegions.filter((r) => hl.locations.has(`region:${r.id}`)));

  // With names hidden by the level of detail, a few Regions stay named: a
  // short list of targets and the keyboard-focused Region.
  const MAX_NAMED_TARGETS = 8;
  let focusRegionId: string | null = $state(null);
  function nameSize(regionId: string): number {
    if (!settings.showRegionNames) return 0;
    if (lod.name) return lod.name;
    const fewTargets = hlRegions.length <= MAX_NAMED_TARGETS && (hl.regions.has(regionId) || hl.locations.has(`region:${regionId}`));
    return fewTargets || focusRegionId === regionId ? lod.nameCapped : 0;
  }
  type Region = (typeof map.regions)[number];
  /** Approximate box of a Region's name in board units, or null when hidden. */
  function nameBox(region: Region): Rect | null {
    const size = nameSize(region.id);
    if (!size) return null;
    const lines = wrapLabel(region.name, nameLineLength(size));
    const w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
    const bottom = region.labelY + LABEL.nameBaseline + 0.25 * size;
    const h = (lines.length - 1 + 1.05) * size;
    return { x: region.labelX - w / 2, y: bottom - h, w, h };
  }

  // ------------------------------------------------------------------ harvest notes
  // A note is a pill in the first slot around its Region label that is clear
  // of every piece, name and earlier note; with no clear slot, or when zoomed
  // too far out for text, it shrinks to a badge on the resource disc (the
  // hover card and the harvest panel still spell it out).
  const NOTE_CHARS = 20;
  const notes = $derived.by(() => {
    const out: { region: Region; lines: string[]; box: Rect | null }[] = [];
    const noted = map.regions.filter((r) => previewByRegion.get(r.id)?.notes.length);
    if (noted.length === 0) return out;

    const m = lod.minor;
    const obstacles = { circles: [] as Circle[], segments: [] as Segment[], rects: [] as Rect[] };
    if (m) {
      for (const s of map.sites) {
        obstacles.circles.push(holdingBySite.has(s.id) ? { x: s.x, y: s.y - 8, r: 26 } : { x: s.x, y: s.y, r: 14 });
        if (s.tradePost) obstacles.circles.push({ x: s.x - 22 - (postScale - 1) * 8, y: s.y - 18 - (postScale - 1) * 8, r: 10 * postScale });
      }
      for (const menace of Object.values(gs.menaces)) obstacles.circles.push({ ...menacePos(menace), r: 22 });
      for (const pos of bannerPositions.values()) obstacles.circles.push({ x: pos.x + 3, y: pos.y - 11, r: 16 });
      for (const route of map.routes) {
        const a = sitesById.get(route.siteA);
        const b = sitesById.get(route.siteB);
        if (a && b) obstacles.segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: 7 });
      }
      for (const r of map.regions) {
        obstacles.rects.push({ x: r.labelX - 20, y: r.labelY - 20, w: 40, h: LABEL.pipY + 26 });
        const name = nameBox(r);
        if (name) obstacles.rects.push(name);
      }
    }

    for (const region of noted) {
      const lines = wrapLabel((previewByRegion.get(region.id)?.notes ?? []).map((n) => t(`harvest.${n}`)).join(" · "), NOTE_CHARS);
      if (!m) {
        out.push({ region, lines, box: null });
        continue;
      }
      const size = { w: Math.max(...lines.map((l) => l.length)) * m * 0.62 + m, h: (lines.length + 0.5) * m * 1.1 };
      const nameTop = (nameBox(region)?.y ?? region.labelY - 20) - region.labelY;
      const box = placeNote(noteSlots({ x: region.labelX, y: region.labelY }, size, nameTop), obstacles);
      if (box) obstacles.rects.push(box);
      out.push({ region, lines, box });
    }
    return out;
  });

  // ------------------------------------------------------------------ hover
  // Mouse and pen only: touch has no hover, and taps already open the
  // inspector, so nothing here is needed to play on a touch screen.
  const TIP_DELAY_MS = 350;
  let hover: Pick | null = $state(null);
  let tipReady = $state(false);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverEl: Element | null = null;
  const samePick = (a: Pick | null, b: Pick) => !!a && JSON.stringify(a) === JSON.stringify(b);
  function hoverIn(e: PointerEvent, p: Pick) {
    if (e.pointerType === "touch" || e.buttons !== 0) return;
    hover = p;
    hoverEl = e.currentTarget as Element;
    if (p.kind === "region") ui.hoverRegionId = p.id;
    tipReady = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => (tipReady = true), TIP_DELAY_MS);
  }
  function clearHover() {
    hover = null;
    hoverEl = null;
    tipReady = false;
    clearTimeout(tipTimer);
  }
  function hoverOut(p: Pick) {
    if (p.kind === "region" && ui.hoverRegionId === p.id) ui.hoverRegionId = null;
    if (samePick(hover, p)) clearHover();
  }
  // The card follows state changes (AI and online moves arrive every few
  // hundred ms) while the hovered piece's node lives. Browsers send no
  // pointerleave for a node that was removed, so a state or mode change that
  // removed it drops the card (it returns on the next pointerenter).
  $effect(() => {
    void gs;
    void hl;
    untrack(() => {
      if (hoverEl?.isConnected) return;
      clearHover();
      ui.hoverRegionId = null;
    });
  });
  $effect(() => () => clearTimeout(tipTimer));
  const hoverRegion = $derived(ui.hoverRegionId ? regionsById.get(ui.hoverRegionId) : undefined);

  /** The hovered piece's extent in board units: the card goes above `top` or below `bottom`. */
  function anchorOf(p: Pick): { x: number; top: number; bottom: number } | null {
    switch (p.kind) {
      case "region": {
        const r = regionsById.get(p.id);
        // Clear of the name above and the Banners below.
        return r ? { x: r.labelX, top: nameBox(r)?.y ?? r.labelY - 20, bottom: r.labelY + LABEL.bannerY + 6 } : null;
      }
      case "site": {
        const s = sitesById.get(p.id);
        return s ? { x: s.x, top: s.y - (holdingBySite.has(s.id) ? 32 : 16), bottom: s.y + 16 } : null;
      }
      case "route": {
        const route = routesById.get(p.id);
        const a = route && sitesById.get(route.siteA);
        const b = route && sitesById.get(route.siteB);
        return a && b ? { x: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 10, bottom: (a.y + b.y) / 2 + 10 } : null;
      }
      case "banner": {
        const pos = bannerPositions.get(p.id);
        return pos ? { x: pos.x, top: pos.y - 26, bottom: pos.y + 6 } : null;
      }
      case "menace": {
        const m = gs.menaces[p.id];
        if (!m) return null;
        const pos = menacePos(m);
        return { x: pos.x, top: pos.y - 22, bottom: pos.y + 22 };
      }
      default:
        return null;
    }
  }
  // The card's measured size (it follows the Text size setting) keeps it on
  // the board: above the piece when it fits, else below, else on the roomier
  // side, clamped to the board's edges.
  const TIP_GAP_PX = 10;
  const TIP_MARGIN_PX = 4;
  let tipW = $state(0);
  let tipH = $state(0);
  const tip = $derived.by(() => {
    if (!hover || !tipReady) return null;
    const text = describePick(map, gs, hover, bannerRegion);
    const anchor = anchorOf(hover);
    if (!text || !anchor) return null;
    const noteLines = hover.kind === "region" ? (previewByRegion.get(hover.id)?.notes ?? []).map((n) => t(`harvest.${n}`)) : [];
    const board = { w: boardW, h: boardH };
    const top = boardToScreen({ x: anchor.x, y: anchor.top }, viewport.box, board, align);
    const bottom = boardToScreen({ x: anchor.x, y: anchor.bottom }, viewport.box, board, align).y;
    const roomAbove = top.y - TIP_GAP_PX - TIP_MARGIN_PX;
    const roomBelow = boardH - bottom - TIP_GAP_PX - TIP_MARGIN_PX;
    const above = roomAbove >= tipH || (roomBelow < tipH && roomAbove >= roomBelow);
    const y = above ? top.y - TIP_GAP_PX - tipH : bottom + TIP_GAP_PX;
    const clamp = (v: number, max: number) => Math.max(TIP_MARGIN_PX, Math.min(max - TIP_MARGIN_PX, v));
    return { ...text, lines: [...text.lines, ...noteLines], x: clamp(top.x - tipW / 2, boardW - tipW), y: clamp(y, boardH - tipH) };
  });
</script>

<svelte:window onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<svg
  bind:this={svgEl}
  bind:clientWidth={boardW}
  bind:clientHeight={boardH}
  class="board"
  class:hc={settings.highContrast}
  class:targeting
  data-camera="{viewport.box.x} {viewport.box.y} {viewport.box.w} {viewport.box.h}"
  role="application"
  aria-label={t("app.title")}
  style="--dur: {dur}; --lift: {-px(2.5, 3)}px"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onlostpointercapture={(e) => e.target === svgEl && release(e.pointerId)}
>
  <defs>
    <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse">
      <path d="M0,15 Q15,5 30,15 T60,15" fill="none" stroke="#9cc9e6" stroke-width="2" opacity="0.6" />
    </pattern>
    <pattern id="hatch-grain" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
      <line x1="0" y1="0" x2="0" y2="10" stroke="#caa73a" stroke-width="2" opacity="0.35" />
    </pattern>
    <pattern id="hatch-timber" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="7" r="3" fill="#3e7d33" opacity="0.35" />
    </pattern>
    <pattern id="hatch-stone" width="16" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,12 L8,2 L16,12" fill="none" stroke="#7d776d" stroke-width="1.5" opacity="0.35" />
    </pattern>
    <pattern id="hatch-iron" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,0 L12,12 M12,0 L0,12" stroke="#4d5866" stroke-width="1" opacity="0.3" />
    </pattern>
    <pattern id="hatch-essence" width="18" height="18" patternUnits="userSpaceOnUse">
      <path d="M9,3 L10.5,7.5 L15,9 L10.5,10.5 L9,15 L7.5,10.5 L3,9 L7.5,7.5 Z" fill="#7a5bb8" opacity="0.3" />
    </pattern>
    <clipPath id="island-clip"><path d={map.coastline} /></clipPath>
  </defs>

  <!-- The camera: one transform on this group rather than a viewBox, because
       changing the viewBox relayouts the whole board every frame of a pan or
       zoom. The layers below are deliberately not indented under it. -->
  <g class="camera" transform={cameraTransform}>
  <!-- sea -->
  <rect x={viewport.sea.x} y={viewport.sea.y} width={viewport.sea.w} height={viewport.sea.h} fill="#bfe0f2" />
  <rect x={viewport.sea.x} y={viewport.sea.y} width={viewport.sea.w} height={viewport.sea.h} fill="url(#waves)" />
  <path d={map.coastline} fill="#e9dcb4" stroke="#b69e6a" stroke-width="18" transform="translate(0,0)" />

  <CoastLayer {map} />
  <!-- Region fills with the illustrated terrain over them. The Region buttons
       below hold only hit areas, target tints and labels, so all the art
       paints under gameplay text. -->
  <g class="layer-fills" clip-path="url(#island-clip)" pointer-events="none">
    {#each map.regions as region (region.id)}
      <path d={region.path} class="fill" fill={RESOURCE_COLORS[region.resource].fill} stroke="#6b5a3a" stroke-width="2" stroke-linejoin="round" />
      <!-- the terrain art replaces the hatch as the second channel, except in high contrast -->
      {#if settings.highContrast}<path d={region.path} fill="url(#hatch-{region.resource})" />{/if}
    {/each}
  </g>
  <TerrainLayer {map} />

  <!-- terrain / regions -->
  <g class="layer-regions" clip-path="url(#island-clip)">
    {#each map.regions as region (region.id)}
      {@const colors = RESOURCE_COLORS[region.resource]}
      {@const occupants = bannerCountByRegion.get(region.id) ?? 0}
      {@const isHl = hl.regions.has(region.id) || hl.locations.has(`region:${region.id}`)}
      <g
        class="region"
        class:hl={isHl}
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label="{region.name}, {t(`resource.${region.resource}`)}, capacity {region.capacity}, {occupants} Banner(s)"
        onclick={() => pick(isHl && hl.locations.has(`region:${region.id}`) && !hl.regions.has(region.id) ? { kind: "location", location: { kind: "region", regionId: region.id } } : { kind: "region", id: region.id })}
        onkeydown={(e) => key(e, { kind: "region", id: region.id })}
        onpointerenter={(e) => hoverIn(e, { kind: "region", id: region.id })}
        onpointerleave={() => hoverOut({ kind: "region", id: region.id })}
        onfocus={(e) => (focusRegionId = e.currentTarget.matches(":focus-visible") ? region.id : null)}
        onblur={() => (focusRegionId = null)}
      >
        <g>
          <path d={region.path} fill="transparent" />
        </g>
        <g transform="translate({region.labelX},{region.labelY})" pointer-events="none">
          <circle r="23" class="focus-ring" />
          <circle r="17" fill="#fffaf0" stroke={colors.dark} stroke-width="2" />
          <path d={RESOURCE_GLYPHS[region.resource]} fill={region.resource === "grain" ? "none" : colors.dark} stroke={colors.dark} stroke-width={region.resource === "grain" ? 2 : 1} />
          <!-- capacity pips -->
          {#each Array.from({ length: region.capacity }) as _, i}
            <circle cx={(i - (region.capacity - 1) / 2) * 12} cy={LABEL.pipY} r="4" fill={i < occupants ? colors.dark : "#fffaf0"} stroke={colors.dark} stroke-width="1.5" opacity="0.8" />
          {/each}
        </g>
      </g>
    {/each}
  </g>

  <!-- target veil and Region outlines (targets, hover, keyboard focus) -->
  {#if targeting}
    <path class="veil" d={veilPath} fill-rule="evenodd" clip-path="url(#island-clip)" pointer-events="none" />
  {/if}
  <g class="layer-region-edges" clip-path="url(#island-clip)" pointer-events="none">
    {#each hlRegions as r (r.id)}
      <path d={r.path} class="hl-casing" stroke-width={px(6, 8)} />
      <path d={r.path} class="hl-edge" stroke-width={px(2.5, 3.5)} />
    {/each}
    {#if hoverRegion}
      <path d={hoverRegion.path} class="hover-edge" class:target={hlRegions.includes(hoverRegion)} stroke-width={px(2, 3)} />
    {/if}
    {#if focusRegionId && regionsById.get(focusRegionId)}
      <path d={regionsById.get(focusRegionId)?.path} class="focus-edge" stroke-width={px(3, 4)} />
    {/if}
  </g>

  <!-- routes -->
  <g class="layer-routes">
    {#each map.routes as route (route.id)}
      {@const a = sitesById.get(route.siteA)}
      {@const b = sitesById.get(route.siteB)}
      {@const owner = gs.routeOwners[route.id]}
      {@const isHl = hl.routes.has(route.id) || hl.locations.has(`route:${route.id}`)}
      {#if a && b}
        <g
          class="route"
          class:hl={isHl}
          role="button"
          tabindex={isHl || !targeting ? 0 : -1}
          aria-label="{t(`route.${route.kind}`)} {owner ? `owned by ${gs.players[owner]?.displayName}` : 'unowned'}"
          onclick={() => pick(hl.locations.has(`route:${route.id}`) ? { kind: "location", location: { kind: "route", routeId: route.id } } : { kind: "route", id: route.id })}
          onkeydown={(e) => key(e, { kind: "route", id: route.id })}
          onpointerenter={(e) => hoverIn(e, { kind: "route", id: route.id })}
          onpointerleave={() => hoverOut({ kind: "route", id: route.id })}
        >
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hit" />
          {#if owner}
            {@const rt = playerTheme(owner)}
            <!-- a raised piece: offset shadow, dark rim, colour, lit top edge; planks on bridges -->
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} transform="translate(2.5,3)" stroke="#1d160c" stroke-opacity="0.25" stroke-width="13" stroke-linecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a2d1a" stroke-width="13" stroke-linecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={rt.color} stroke-width="8" stroke-linecap="round" />
            {#if route.kind === "bridge"}<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={rt.dark} stroke-opacity="0.4" stroke-width="7" stroke-dasharray="1.2 2.6" />{/if}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} transform="translate(-1.2,-1.4)" stroke={rt.light} stroke-opacity="0.8" stroke-width="1.8" stroke-linecap="round" />
          {:else}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a7650" stroke-width="4" stroke-dasharray={route.kind === "trail" ? "3 7" : "10 6"} stroke-linecap="round" opacity="0.75" />
          {/if}
          {#if route.kind === "bridge"}
            <path d={bridgeRails(a, b)} fill="none" stroke="#4a3522" stroke-width="2.4" stroke-linecap="round" />
          {/if}
          {#if fogged.has(route.id)}
            <ellipse cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx="34" ry="16" fill="#f4f4f4" opacity="0.8" />
          {/if}
          {#if isHl}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hl-casing" stroke-width={px(8, 16)} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hl-line" stroke-width={px(3.5, 7)} stroke-dasharray="{px(7, 12)} {px(4, 7)}" />
          {/if}
        </g>
      {/if}
    {/each}
  </g>

  <!-- sites and holdings -->
  <g class="layer-sites">
    {#each map.sites as site (site.id)}
      {@const holding = holdingBySite.get(site.id)}
      {@const isHl = hl.sites.has(site.id) || hl.locations.has(`site:${site.id}`)}
      {@const theme = holding ? playerTheme(holding.ownerId) : null}
      <g
        class="site"
        class:hl={isHl}
        transform="translate({site.x},{site.y})"
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label={holding
          ? `${t(`holding.${holding.type}`)} of ${gs.players[holding.ownerId]?.displayName}${site.landmarkId ? `, ${t(`landmark.${site.landmarkId}`)}` : ""}`
          : `${t("inspect.site")}${site.landmarkId ? `, ${t(`landmark.${site.landmarkId}`)}` : ""}${site.tradePost ? `, ${t("aria.trade_post", { resource: t(`resource.${site.tradePost.resource}`) })}` : ""}`}
        onclick={() => pick(hl.locations.has(`site:${site.id}`) ? { kind: "location", location: { kind: "site", siteId: site.id } } : { kind: "site", id: site.id })}
        onkeydown={(e) => key(e, { kind: "site", id: site.id })}
        onpointerenter={(e) => hoverIn(e, { kind: "site", id: site.id })}
        onpointerleave={() => hoverOut({ kind: "site", id: site.id })}
      >
        <circle r="22" class="hit" />
        {#if site.landmarkId}
          <g transform="translate(0,-4)" pointer-events="none">
            <LandmarkArt id={site.landmarkId} />
          </g>
        {/if}
        {#if site.tradePost}
          <g transform="translate({-22 - (postScale - 1) * 8},{-18 - (postScale - 1) * 8}) scale({postScale})" pointer-events="none">
            <circle r="10" fill="#fffaf0" stroke="#7a5a1a" stroke-width="2" />
            <text y="4" text-anchor="middle" class="post">2:1</text>
          </g>
        {/if}
        {#if holding && theme}
          <g pointer-events="none" class="holding">
            <HoldingFigure type={holding.type} {theme} />
            <path d={emblemPath(theme.shape, 4)} transform="translate(0,-26)" fill={theme.light} stroke={theme.dark} stroke-width="1.5" />
          </g>
        {:else}
          <circle r="7" fill="#fffaf0" stroke="#6b5a3a" stroke-width="2.5" pointer-events="none" />
        {/if}
        {#if isHl}
          <circle r={siteRing(!!holding)} class="hl-casing" stroke-width={px(5, 6)} pointer-events="none" />
          <circle r={siteRing(!!holding)} class="hl-ring" stroke-width={px(2.5, 3)} pointer-events="none" />
        {/if}
      </g>
    {/each}
  </g>

  <!-- banners -->
  <g class="layer-banners">
    {#each Object.values(gs.banners) as banner (banner.id)}
      {@const pos = bannerPositions.get(banner.id)}
      {@const theme = playerTheme(banner.ownerId)}
      {@const isHl = hl.banners.has(banner.id)}
      {@const selected = ui.selectedBannerId === banner.id}
      {#if pos}
        <g
          class="banner"
          class:hl={isHl}
          class:selected
          class:mine={myBanners.has(banner.id)}
          style="transform: translate({pos.x}px, {pos.y}px)"
          role="button"
          tabindex={isHl || !targeting ? 0 : -1}
          aria-label={bannerLabel(banner)}
          aria-pressed={selected}
          onclick={() => pick({ kind: "banner", id: banner.id })}
          onkeydown={(e) => key(e, { kind: "banner", id: banner.id })}
          onpointerenter={(e) => hoverIn(e, { kind: "banner", id: banner.id })}
          onpointerleave={() => hoverOut({ kind: "banner", id: banner.id })}
        >
          <rect x="-12" y="-26" width="26" height="30" class="hit" />
          <!-- a raised piece: cast shadows of pole and flag, gold finial, lit top edge -->
          <line x1="-6" y1="4" x2="6" y2="8.5" stroke="#1d160c" stroke-opacity="0.25" stroke-width="3" stroke-linecap="round" />
          <polygon points="-3.5,-21 14.5,-16 -3.5,-9" fill="#1d160c" opacity="0.2" />
          <line x1="-6" y1="4" x2="-6" y2="-24" stroke="#3a2d1a" stroke-width="2.5" />
          <circle cx="-6" cy="-25.5" r="2" fill="#e0b64a" stroke="#6b4c00" stroke-width="0.8" />
          <path d="M-6,-24 L12,-19 L-6,-12 Z" fill={theme.color} stroke={theme.dark} stroke-width="1.5" opacity={banner.settled ? 1 : 0.75} />
          <line x1="-4.8" y1="-22.8" x2="9" y2="-19" stroke={theme.light} stroke-width="1.2" stroke-linecap="round" opacity="0.85" />
          <path d={emblemPath(theme.shape, 2.4)} transform="translate(0,-18)" fill={theme.light} pointer-events="none" />
          {#if !banner.settled}<circle cx="-6" cy="4" r="2.5" fill="#fffaf0" stroke={theme.dark} />{/if}
          {#if isHl || selected}
            <circle cx="3" cy="-12" r={bannerRing} class="hl-casing" stroke-width={px(5, 6)} pointer-events="none" />
            <circle cx="3" cy="-12" r={bannerRing} class="hl-ring" stroke-width={px(2.5, 3)} pointer-events="none" />
          {/if}
        </g>
      {/if}
    {/each}
  </g>

  <!-- menaces -->
  <g class="layer-menaces">
    {#each Object.values(gs.menaces) as menace (menace.id)}
      {@const pos = menacePos(menace)}
      {@const isHl = hl.menaces.has(menace.id)}
      {@const hoard = Object.entries(menace.state.hoard ?? {}).filter(([, n]) => (n ?? 0) > 0)}
      <g
        class="menace"
        class:hl={isHl}
        class:selected={ui.selectedMenaceId === menace.id}
        style="transform: translate({pos.x}px, {pos.y}px)"
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label="{t(`menace.${menace.type}.name`)}: {t(`menace.${menace.type}.rules`)}"
        onclick={() => pick({ kind: "menace", id: menace.id })}
        onkeydown={(e) => key(e, { kind: "menace", id: menace.id })}
        onpointerenter={(e) => hoverIn(e, { kind: "menace", id: menace.id })}
        onpointerleave={() => hoverOut({ kind: "menace", id: menace.id })}
      >
        <circle r="25" class="focus-ring" />
        <MenaceFigure type={menace.type} animate={dur > 0} />
        {#if hoard.length}
          <text y={20 + Math.max(12, lod.minor)} text-anchor="middle" class="hoard" style="font-size: {Math.max(12, lod.minor)}px">{hoard.map(([r, n]) => `${n}${RESOURCE_COLORS[r as keyof typeof RESOURCE_COLORS].label}`).join(" ")}</text>
        {/if}
        {#if isHl || ui.selectedMenaceId === menace.id}
          <circle r={menaceRing} class="hl-casing" stroke-width={px(5, 6)} pointer-events="none" />
          <circle r={menaceRing} class="hl-ring" stroke-width={px(2.5, 3)} pointer-events="none" />
        {/if}
      </g>
    {/each}
  </g>

  <!-- labels sit above every piece so neighbours and Routes cannot clip them -->
  <g class="layer-labels" pointer-events="none">
    {#each map.regions as region (region.id)}
      {@const size = nameSize(region.id)}
      {#if size}
        {@const lines = wrapLabel(region.name, nameLineLength(size))}
        <text class="region-name" text-anchor="middle" style="font-size: {size}px; stroke-width: {size * 0.22}px">
          {#each lines as line, i}
            <tspan x={region.labelX} y={region.labelY + LABEL.nameBaseline - (lines.length - 1 - i) * size}>{line}</tspan>
          {/each}
        </text>
      {/if}
    {/each}
    {#if lod.landmark}
      {#each map.sites as site (site.id)}
        {#if site.landmarkId}
          <text class="landmark" x={site.x} y={site.y + 24 + lod.landmark} text-anchor="middle" style="font-size: {lod.landmark}px; stroke-width: {lod.landmark * 0.25}px">{t(`landmark.${site.landmarkId}`)}</text>
        {/if}
      {/each}
    {/if}
    <!-- harvest notes after every name and landmark, so a neighbour's name never covers one -->
    {#each notes as { region, lines, box } (region.id)}
      {#if box}
        <g class="note" transform="translate({box.x},{box.y})">
          <rect width={box.w} height={box.h} rx={lod.minor * 0.6} />
          <text text-anchor="middle" style="font-size: {lod.minor}px">
            {#each lines as line, i}<tspan x={box.w / 2} y={(0.25 + (i + 1) * 1.1) * lod.minor}>{line}</tspan>{/each}
          </text>
        </g>
      {:else}
        <!-- on the disc's left edge, clear of the name above and the pips below -->
        <g class="note-badge" transform="translate({region.labelX - 17},{region.labelY}) scale({lod.badge / 16})">
          <circle r="8" />
          <path d="M0,-4.5 L0,1 M0,3.6 L0,3.8" />
        </g>
      {/if}
    {/each}
  </g>

  <!-- menace destinations in Regions (Routes and Sites are marked in their own layers) -->
  {#if destRegions.length > 0}
    <g class="layer-dests" pointer-events="none">
      {#each destRegions as r (r.id)}
        <circle cx={r.labelX + 40} cy={r.labelY + 4} r={px(8, 12)} class="hl-casing" stroke-width={px(5, 6)} />
        <circle cx={r.labelX + 40} cy={r.labelY + 4} r={px(8, 12)} class="dest" stroke-width={px(2.5, 3)} />
      {/each}
    </g>
  {/if}
  </g>
</svg>

{#if targeting}
  <!-- Breathing glow around every target. Kept out of the board <svg> so the
       animation only changes this layer's opacity on the compositor. -->
  <svg class="glow" aria-hidden="true">
    <defs>
      {#each hlRegions as r (r.id)}<clipPath id="glow-clip-{r.id}"><path d={r.path} /></clipPath>{/each}
    </defs>
    <!-- the board's own camera transform, so the glow tracks every pan and zoom exactly -->
    <g transform={cameraTransform}>
    {#each hlRegions as r (r.id)}
      <path d={r.path} clip-path="url(#glow-clip-{r.id})" stroke-width={px(16, 22)} />
    {/each}
    {#each hlRouteLines as l (l.id)}
      {#if l.a && l.b}<line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke-width={px(16, 28)} />{/if}
    {/each}
    {#each hlSites as site (site.id)}
      <circle cx={site.x} cy={site.y} r={siteRing(holdingBySite.has(site.id)) + px(5, 6)} stroke-width={px(7, 9)} />
    {/each}
    {#each ringedBanners as b (b.id)}
      {@const pos = bannerPositions.get(b.id)}
      {#if pos}<circle cx={pos.x + 3} cy={pos.y - 12} r={bannerRing + px(5, 6)} stroke-width={px(7, 9)} />{/if}
    {/each}
    {#each ringedMenaces as m (m.id)}
      {@const pos = menacePos(m)}
      <circle cx={pos.x} cy={pos.y} r={menaceRing + px(5, 6)} stroke-width={px(7, 9)} />
    {/each}
    {#each destRegions as r (r.id)}
      <circle cx={r.labelX + 40} cy={r.labelY + 4} r={px(8, 12) + px(5, 6)} stroke-width={px(7, 9)} />
    {/each}
    </g>
  </svg>
{/if}

{#if tip}
  <div class="tip" role="tooltip" bind:offsetWidth={tipW} bind:offsetHeight={tipH} style="left: {tip.x}px; top: {tip.y}px">
    <strong>{tip.title}</strong>
    {#each tip.lines as line}<span>{line}</span>{/each}
  </div>
{/if}

<style>
  .board {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    background: #bfe0f2;
    cursor: grab;
  }
  .board:active {
    cursor: grabbing;
  }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 22;
  }
  /* Label font sizes and halo widths are set inline from the camera scale. */
  .region-name {
    font: 700 13px/1 var(--font-display);
    fill: #2e2211;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
    stroke-linejoin: round;
    letter-spacing: 0.01em;
  }
  .note rect {
    fill: #fffaf0;
    fill-opacity: 0.94;
    stroke: #a33b2a;
    stroke-width: 1.5;
  }
  .note text {
    font: 600 11px/1 var(--font-body);
    fill: #7a1d10;
  }
  .note-badge circle {
    fill: #b3261e;
    stroke: #fffaf0;
    stroke-width: 2;
  }
  .note-badge path {
    stroke: #fffaf0;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .landmark {
    font: italic 600 12px/1 var(--font-display);
    fill: #3d2f1a;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .post {
    font: 700 9px/1 var(--font-body);
    fill: #7a5a1a;
  }
  .hoard {
    font: 700 12px/1 var(--font-body);
    fill: #7a1d10;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
  }
  /* Targets: a dark casing under a crisp light line reads on every terrain
     colour; stroke widths are set inline so they stay crisp at any zoom. */
  .veil {
    fill: #1d1a14;
    opacity: 0.32;
    animation: veil-in calc(var(--dur) * 180ms) ease-out;
  }
  .hl-casing {
    fill: none;
    stroke: #2a1f10;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .hl-edge,
  .hl-line,
  .hl-ring,
  .dest {
    fill: none;
    stroke: #fff8dc;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .hover-edge {
    fill: #fffaf0;
    fill-opacity: 0.16;
    stroke: #fffaf0;
    stroke-opacity: 0.9;
  }
  .hover-edge.target {
    fill-opacity: 0.24;
    stroke: #ffd23f;
    stroke-opacity: 1;
  }
  .focus-edge {
    fill: none;
    stroke: #1b5fd1;
  }
  .focus-ring {
    fill: none;
    stroke: none;
  }
  .glow {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0.7;
    will-change: opacity;
    animation: breathe 1.6s ease-in-out infinite alternate;
  }
  .glow path,
  .glow line,
  .glow circle {
    fill: none;
    stroke: #ffd23f;
    stroke-opacity: 0.55;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tip {
    position: absolute;
    z-index: 4;
    width: max-content;
    max-width: min(16rem, calc(100% - 8px));
    display: grid;
    gap: 0.1rem;
    padding: 0.35rem 0.6rem;
    background: var(--paper);
    border: 2px solid #8a7650;
    border-radius: 9px;
    box-shadow: 0 4px 14px #0003;
    font-size: 0.85rem;
    line-height: 1.3;
    pointer-events: none;
  }
  .tip strong {
    font-family: var(--font-display);
    font-size: 1rem;
  }
  .targeting .route:not(.hl),
  .targeting .site:not(.hl),
  .targeting .banner:not(.hl):not(.selected),
  .targeting .menace:not(.hl):not(.selected) {
    opacity: 0.5;
  }
  .targeting .region:not(.hl),
  .targeting .route:not(.hl),
  .targeting .site:not(.hl),
  .targeting .banner:not(.hl):not(.mine),
  .targeting .menace:not(.hl) {
    pointer-events: none;
  }
  .region.hl,
  .route.hl,
  .site.hl,
  .banner.hl,
  .menace.hl {
    cursor: pointer;
  }
  .banner,
  .menace {
    transition:
      transform calc(var(--dur) * 280ms) ease-out,
      translate calc(var(--dur) * 120ms) ease-out;
  }
  .menace {
    transition-duration: calc(var(--dur) * 450ms), calc(var(--dur) * 120ms);
  }
  .site {
    transition: translate calc(var(--dur) * 120ms) ease-out;
  }
  /* Hover lifts and brightens targets; guarded so taps never leave a sticky
     hover state on touch screens. */
  @media (hover: hover) {
    .site.hl:hover,
    .banner.hl:hover,
    .menace.hl:hover {
      translate: 0 var(--lift);
    }
    .site.hl:hover .hl-ring,
    .banner.hl:hover .hl-ring,
    .menace.hl:hover .hl-ring,
    .route.hl:hover .hl-line {
      stroke: #ffd23f;
    }
  }
  .banner.selected path {
    stroke: #ffcf1f;
    stroke-width: 3;
  }
  /* Pieces draw their own keyboard ring, shaped to the piece; mouse focus
     shows nothing. */
  g[role="button"]:focus {
    outline: none;
  }
  g[role="button"]:focus-visible .focus-ring {
    stroke: #1b5fd1;
    stroke-width: 4;
  }
  g[role="button"]:focus-visible .hit {
    stroke: #1b5fd1;
    stroke-width: 4;
    fill: rgba(27, 95, 209, 0.12);
  }
  .hc .layer-fills .fill {
    stroke: #000;
    stroke-width: 3;
  }
  .hc .veil {
    opacity: 0.5;
  }
  .hc .hl-casing {
    stroke: #000;
  }
  .hc .hl-edge,
  .hc .hl-line,
  .hc .hl-ring,
  .hc .dest {
    stroke: #ffff00;
  }
  @keyframes breathe {
    from {
      opacity: 0.25;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes veil-in {
    from {
      opacity: 0;
    }
  }
</style>
