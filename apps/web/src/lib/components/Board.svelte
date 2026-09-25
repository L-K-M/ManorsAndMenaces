<script lang="ts">
  // The SVG board (spec §47). Layers, bottom to top: sea, terrain/Regions,
  // Routes, Sites/Holdings, Banners, Menaces, highlights. Every interactive
  // entity is a focusable button with an accessible name (spec §52).
  import { getHarvestPreview, getPlayerBanners, type Banner, type MenaceInstance } from "@manors-menaces/rules";
  import { untrack } from "svelte";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { computeHighlights, legalFor, onPick } from "../game/interaction.js";
  import { BoardAlign, LABEL, bannerSlot, boardToScreen, labelLod, nameLineLength, noteSlots, placeNote, screenScale, strokeWidth, wrapLabel, type Circle, type Rect, type Segment } from "../game/board-view.js";
  import { describePick } from "../game/inspect.js";
  import { regionName } from "../game/log.js";
  import { ui, type Pick } from "../stores/ui.svelte.js";
  import { viewport, setFull, zoomAt, panBy } from "../stores/viewport.svelte.js";
  import { settings, animationScale } from "../stores/settings.svelte.js";
  import { MENACE_THEME, PLAYER_THEMES, RESOURCE_COLORS, RESOURCE_GLYPHS, emblemPath } from "../theme.js";

  let { session }: { session: GameSession } = $props();

  const map = $derived(session.map);
  const gs = $derived(session.draft);
  const legal = $derived(legalFor(session));
  const hl = $derived(computeHighlights(session, legal));
  const sitesById = $derived(new Map(map.sites.map((s) => [s.id, s])));
  const regionsById = $derived(new Map(map.regions.map((r) => [r.id, r])));

  $effect(() => {
    if (viewport.full.w !== map.width || viewport.full.h !== map.height) setFull(map.width, map.height);
  });

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

  const preview = $derived(session.localActor ? getHarvestPreview(session.ctx, gs, session.localActor, ui.bannerDraft) : null);
  const previewByRegion = $derived(new Map((preview?.banners ?? []).map((b) => [b.regionId, b])));

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
    const route = map.routes.find((r) => r.id === loc.routeId);
    const a = route && sitesById.get(route.siteA);
    const b = route && sitesById.get(route.siteB);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  }

  const fogged = $derived(new Set(gs.activeEffects.filter((e) => e.kind === "fog").map((e) => (e.kind === "fog" ? e.routeId : ""))));

  // ------------------------------------------------------------------ input
  let svgEl: SVGSVGElement | undefined = $state();
  let boardW = $state(1);
  let boardH = $state(1);
  // On tall screens, pin the map to the top and leave room below for panels.
  const portrait = $derived(boardH > boardW * 1.1);
  const pointers = new Map<number, { x: number; y: number }>();
  let dragMoved = false;
  let pinchDist = 0;

  // Screen ↔ board coordinates via the SVG's own transform, so any
  // preserveAspectRatio alignment works.
  function toBoard(clientX: number, clientY: number): { x: number; y: number } {
    const m = svgEl?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function scaleFactor(): number {
    return svgEl?.getScreenCTM()?.a ?? 1;
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }
  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) {
        const mid = toBoard((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(d / pinchDist, mid.x, mid.y);
      }
      pinchDist = d;
      dragMoved = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (!dragMoved && Math.hypot(dx, dy) < 4) return;
    if (!dragMoved) svgEl?.setPointerCapture(e.pointerId);
    dragMoved = true;
    const s = scaleFactor();
    panBy(dx / s, dy / s);
  }
  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  }

  function pick(p: Pick) {
    if (dragMoved) return;
    // The inspector (or the move itself) takes over from the hover card.
    clearHover();
    void onPick(session, legal, p);
  }
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
    return `${owner}'s Banner, ${r ? `in ${regionName(map, r)}` : "at home"}${b.settled ? ", settled" : ""}`;
  };
  const myBanners = $derived(new Set(session.localActor ? getPlayerBanners(gs, session.localActor).map((b) => b.id) : []));

  // ------------------------------------------------------------------ view scale
  // Labels, outlines and rings are sized from the camera scale so they stay
  // legible and crisp at any zoom (see board-view.ts).
  const align = $derived(portrait ? BoardAlign.Top : BoardAlign.Middle); // matches preserveAspectRatio
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
  const holdingSites = $derived(new Set(Object.values(gs.holdings).map((h) => h.siteId)));
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
    const fewTargets = hlRegions.length <= MAX_NAMED_TARGETS && hlRegions.some((r) => r.id === regionId);
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
        obstacles.circles.push(holdingSites.has(s.id) ? { x: s.x, y: s.y - 8, r: 26 } : { x: s.x, y: s.y, r: 14 });
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
        return s ? { x: s.x, top: s.y - (holdingSites.has(s.id) ? 32 : 16), bottom: s.y + 16 } : null;
      }
      case "route": {
        const route = map.routes.find((r) => r.id === p.id);
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

<svg
  bind:this={svgEl}
  bind:clientWidth={boardW}
  bind:clientHeight={boardH}
  class="board"
  class:hc={settings.highContrast}
  class:targeting
  viewBox="{viewport.box.x} {viewport.box.y} {viewport.box.w} {viewport.box.h}"
  preserveAspectRatio={portrait ? "xMidYMin meet" : "xMidYMid meet"}
  role="application"
  aria-label={t("app.title")}
  style="--dur: {dur}; --lift: {-px(2.5, 3)}px"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
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

  <!-- sea -->
  <rect x={-800} y={-600} width={map.width + 1600} height={map.height + 1200} fill="#bfe0f2" />
  <rect x={-800} y={-600} width={map.width + 1600} height={map.height + 1200} fill="url(#waves)" />
  <path d={map.coastline} fill="#e9dcb4" stroke="#b69e6a" stroke-width="18" transform="translate(0,0)" />

  <!-- terrain / regions -->
  <g class="layer-regions" clip-path="url(#island-clip)">
    {#each map.regions as region (region.id)}
      {@const colors = RESOURCE_COLORS[region.resource]}
      {@const occupants = Object.values(gs.banners).filter((b) => bannerRegion(b) === region.id).length}
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
          <path d={region.path} fill={colors.fill} stroke="#6b5a3a" stroke-width="2" stroke-linejoin="round" />
          <path d={region.path} fill="url(#hatch-{region.resource})" pointer-events="none" />
        </g>
        <g transform="translate({region.labelX},{region.labelY})" pointer-events="none">
          <circle r="23" class="focus-ring" />
          <circle r="17" fill="#fffaf0" stroke={colors.dark} stroke-width="2" />
          <path d={RESOURCE_GLYPHS[region.resource]} fill={region.resource === "grain" ? "none" : colors.dark} stroke={colors.dark} stroke-width={region.resource === "grain" ? 2 : 1} />
          <!-- capacity pips -->
          {#each Array.from({ length: region.capacity }) as _, i}
            <circle cx={-6 + i * 12 - (region.capacity - 1) * 0} cy={LABEL.pipY} r="4" fill={i < occupants ? colors.dark : "#fffaf0"} stroke={colors.dark} stroke-width="1.5" opacity="0.8" />
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
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a2d1a" stroke-width="13" stroke-linecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={playerTheme(owner).color} stroke-width="8" stroke-linecap="round" />
          {:else}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a7650" stroke-width="4" stroke-dasharray={route.kind === "trail" ? "3 7" : "10 6"} stroke-linecap="round" opacity="0.75" />
          {/if}
          {#if route.kind === "bridge"}
            <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="5" fill="#8a7650" opacity="0.7" />
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
      {@const holding = Object.values(gs.holdings).find((h) => h.siteId === site.id)}
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
          : `Site${site.landmarkId ? `, ${t(`landmark.${site.landmarkId}`)}` : ""}${site.tradePost ? `, Trading Post (${t(`resource.${site.tradePost.resource}`)} 2:1)` : ""}`}
        onclick={() => pick(hl.locations.has(`site:${site.id}`) ? { kind: "location", location: { kind: "site", siteId: site.id } } : { kind: "site", id: site.id })}
        onkeydown={(e) => key(e, { kind: "site", id: site.id })}
        onpointerenter={(e) => hoverIn(e, { kind: "site", id: site.id })}
        onpointerleave={() => hoverOut({ kind: "site", id: site.id })}
      >
        <circle r="22" class="hit" />
        {#if site.landmarkId}
          <g transform="translate(0,-4)" pointer-events="none">
            <path d="M-14,10 L-14,-6 L-9,-6 L-9,-12 L-4,-12 L-4,-6 L4,-6 L4,-12 L9,-12 L9,-6 L14,-6 L14,10 Z" fill="#d8cbb0" stroke="#5a4a32" stroke-width="2" />
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
            {#if holding.type === "manor"}
              <path d="M-13,12 L-13,-2 L0,-14 L13,-2 L13,12 Z" fill={theme.color} stroke={theme.dark} stroke-width="2.5" />
              <path d="M-4,12 L-4,4 L4,4 L4,12" fill={theme.dark} />
            {:else}
              <path d="M-17,14 L-17,-8 L-12,-8 L-12,-14 L-6,-14 L-6,-8 L6,-8 L6,-14 L12,-14 L12,-8 L17,-8 L17,14 Z" fill={theme.color} stroke={theme.dark} stroke-width="2.5" />
              <path d="M-4,14 L-4,4 A4,4 0 0,1 4,4 L4,14" fill={theme.dark} />
            {/if}
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
          <line x1="-6" y1="4" x2="-6" y2="-24" stroke="#3a2d1a" stroke-width="2.5" />
          <path d="M-6,-24 L12,-19 L-6,-12 Z" fill={theme.color} stroke={theme.dark} stroke-width="1.5" opacity={banner.settled ? 1 : 0.75} />
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
      {@const theme = MENACE_THEME[menace.type]}
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
        <circle r="19" fill="#fffaf0" stroke={theme.color} stroke-width="3" />
        <path d={theme.glyph} fill={theme.color} stroke="#1f1f1f" stroke-width="1" fill-rule="evenodd" />
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
</svg>

{#if targeting}
  <!-- Breathing glow around every target. Kept out of the board <svg> so the
       animation only changes this layer's opacity on the compositor. -->
  <svg class="glow" viewBox="{viewport.box.x} {viewport.box.y} {viewport.box.w} {viewport.box.h}" preserveAspectRatio="{align} meet" aria-hidden="true">
    <defs>
      {#each hlRegions as r (r.id)}<clipPath id="glow-clip-{r.id}"><path d={r.path} /></clipPath>{/each}
    </defs>
    {#each hlRegions as r (r.id)}
      <path d={r.path} clip-path="url(#glow-clip-{r.id})" stroke-width={px(16, 22)} />
    {/each}
    {#each hlRouteLines as l (l.id)}
      {#if l.a && l.b}<line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke-width={px(16, 28)} />{/if}
    {/each}
    {#each hlSites as site (site.id)}
      <circle cx={site.x} cy={site.y} r={siteRing(holdingSites.has(site.id)) + px(5, 6)} stroke-width={px(7, 9)} />
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
  .hc .region > g > path:first-child {
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
